'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';

import {LOG} from './logger';
import {toPromiseFunc} from './utils';

const log = LOG('SourceMapFinder');
const pReadFile = toPromiseFunc(fs.readFile);

const MARK = '//# sourceMappingURL=';
export class SourceMapFinder {

	public static INSTANCE = new SourceMapFinder();

	private _map: {[file:string]:vscode.Uri};

	constructor() {
		this._map = Object.create(null);
	}

	public get(generatedFile:vscode.Uri): Promise<vscode.Uri> {
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
		});
	}
}
