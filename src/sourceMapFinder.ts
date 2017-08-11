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

	public async get(generatedFile: vscode.Uri): Promise<vscode.Uri> {
		log.debug('Looking for sourcemap for ' + generatedFile.fsPath);
		let cacheEntry = this._map[generatedFile.toString()];
		if (typeof cacheEntry !== 'undefined') {
			return Promise.resolve(cacheEntry);
		}

		try {
			const buf = await pReadFile(generatedFile.fsPath);
			const contents = buf.toString();
			const startIndex = contents.lastIndexOf(MARK);
			if (startIndex === -1) {
				log.warn('No sourcemap found for ' + generatedFile.fsPath);
				this._map[generatedFile.toString()] = null;
				return null;
			}

			const sourceMapFile = contents.substring(startIndex + MARK.length);
			const sourceMapUri = vscode.Uri.file(path.join(path.dirname(generatedFile.fsPath), sourceMapFile));

			log.debug('Found sourcemap ' + sourceMapUri.fsPath);

			this._map[generatedFile.toString()] = sourceMapUri;
			return sourceMapUri;

		} catch(err) {
			this._map[generatedFile.toString()] = null;
			return null;
		}
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

	protected async _get(uri: vscode.Uri): Promise<ISourceMapConsumer> {
		const fsPath = uri.fsPath;
		const buf = await pReadFile(fsPath);
		const rawSourceMap = JSON.parse(buf.toString());

		return new sourceMap.SourceMapConsumer(rawSourceMap);
	}
}

async function getSourceMapConsumer(generatedFile: vscode.Uri): Promise<[vscode.Uri, ISourceMapConsumer]> {
	try {
		const sourcemap = await SourceMapFinder.INSTANCE.get(generatedFile);
		if (!sourcemap) {
			return null;
		}

		const reader = await SourceMapCache.INSTANCE.get(sourcemap);
		return [generatedFile, reader];

	} catch(err) {
		return null;
	}
}

export interface ISourceMapConsumers {
	[uri: string]: ISourceMapConsumer;
}

export async function getSourceMapConsumers(generatedFiles: vscode.Uri[]): Promise<ISourceMapConsumers> {
	const promises = generatedFiles.map((file) => getSourceMapConsumer(file));
	const r = await Promise.all<[vscode.Uri, ISourceMapConsumer]>(promises);
	const result: ISourceMapConsumers = Object.create(null);
	r.forEach((entry) => {
		result[entry[0].toString()] = entry[1];
	});
	return result;
}
