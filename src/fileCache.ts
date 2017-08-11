'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';

import { toPromiseFunc } from './utils';
import { LOG } from './logger';

const log = LOG('FileCache');
const pStat = toPromiseFunc(fs.stat);

interface ICacheEntry<T> {
	data: T;
	key: number;
}

/**
 * Use fs.stat and store/cache data to a file.
 */
export abstract class FileCache<T> {

	private _data: { [uri: string]: ICacheEntry<T>; };

	constructor() {
		this._data = Object.create(null);
	}

	public async get(uri: vscode.Uri): Promise<T> {
		// Cache using the mtime of the file
		const fsPath = uri.fsPath;
		const stats = await pStat(fsPath);
		const myKey = stats.mtime.getTime();
		const existingCacheEntry = this._data[fsPath];
		if (existingCacheEntry) {
			if (existingCacheEntry.key === myKey) {
				log.debug('Cache hit for ' + fsPath);
				return existingCacheEntry.data;
			}
		}

		const data = await this._get(uri);
		const newCacheEntry: ICacheEntry<T> = {
			data: data,
			key: myKey
		};
		this._data[fsPath] = newCacheEntry;
		return newCacheEntry.data;
	}

	protected abstract _get(uri: vscode.Uri): Promise<T>;
}
