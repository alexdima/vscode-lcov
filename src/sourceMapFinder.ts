'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
var sourceMap = require("source-map");

import { LOG } from './logger';
import { toPromiseFunc } from './utils';
import { FileCache } from './fileCache';

const log = LOG('SourceMapFinder');
const pReadFile = toPromiseFunc(fs.readFile);

const MARK = '//# sourceMappingURL=';
class SourceMapFinder {

	public static INSTANCE = new SourceMapFinder();

	private _map: { [file: string]: vscode.Uri };

	constructor() {
		this._map = Object.create(null);
	}

	public get(generatedFile: vscode.Uri): Promise<vscode.Uri> {
		log.debug('Looking for sourcemap for ' + generatedFile.fsPath);
		let cacheEntry = this._map[generatedFile.toString()];
		if (typeof cacheEntry !== 'undefined') {
			return Promise.resolve(cacheEntry);
		}

		return pReadFile(generatedFile.fsPath).then((buf) => {
			let contents = buf.toString();
			let startIndex = contents.lastIndexOf(MARK);
			if (startIndex === -1) {
				log.warn('No sourcemap found for ' + generatedFile.fsPath);
				this._map[generatedFile.toString()] = null;
				return null;
			}

			let sourceMapFile = contents.substring(startIndex + MARK.length);
			let sourceMapUri = vscode.Uri.file(path.join(path.dirname(generatedFile.fsPath), sourceMapFile));

			log.debug('Found sourcemap ' + sourceMapUri.fsPath);

			this._map[generatedFile.toString()] = sourceMapUri;
			return sourceMapUri;
		}).then(null, (err) => {
			this._map[generatedFile.toString()] = null;
			return null;
		});
	}
}

export interface IOriginalPosition {
	line: number;
	source: string;
}

export function getSource(sourcemap: ISourceMapConsumer, line: number): IOriginalPosition {
	return sourcemap.originalPositionFor({
		line: line,
		column: 0,
		bias: sourcemap.constructor.LEAST_UPPER_BOUND
	});
}

export interface ISourceMapConsumer {
	constructor: {
		LEAST_UPPER_BOUND: any;
	};

	originalPositionFor(query: {
		line: number;
		column: number;
		bias: any;
	}): IOriginalPosition;
}

class SourceMapCache extends FileCache<ISourceMapConsumer> {

	public static INSTANCE = new SourceMapCache();

	protected _get(uri: vscode.Uri): Promise<ISourceMapConsumer> {
		let fsPath = uri.fsPath;

		return pReadFile(fsPath).then((buf) => {
			let rawSourceMap = JSON.parse(buf.toString());

			return new sourceMap.SourceMapConsumer(rawSourceMap);
		});
	}
}

function getSourceMapConsumer(generatedFile: vscode.Uri): Promise<[vscode.Uri, ISourceMapConsumer]> {
	return SourceMapFinder.INSTANCE.get(generatedFile).then((sourcemap) => {
		if (!sourcemap) {
			return null;
		}
		return SourceMapCache.INSTANCE.get(sourcemap).then((reader) => {
			return [generatedFile, reader];
		});
	}).then(null, (err) => {
		return null;
	});
}

export interface ISourceMapConsumers {
	[uri: string]: ISourceMapConsumer;
}

export function getSourceMapConsumers(generatedFiles: vscode.Uri[]): Promise<ISourceMapConsumers> {
	let promises = generatedFiles.map((file) => getSourceMapConsumer(file));

	return Promise.all<[vscode.Uri, ISourceMapConsumer]>(promises).then((r) => {
		let result: ISourceMapConsumers = Object.create(null);
		r.forEach((entry) => {
			result[entry[0].toString()] = entry[1];
		});
		return result;
	});
}
