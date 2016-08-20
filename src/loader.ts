'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
var parse = require('lcov-parse');

import {LOG} from './logger';
import {toPromiseFunc} from './utils';

const log = LOG('Loader');
const pReadFile = toPromiseFunc(fs.readFile);
const pParse = toPromiseFunc(parse);
const pStat = toPromiseFunc(fs.stat);

export interface IRawLineCoverageDetail {
	line: number;
	hit: number;
}
export interface IRawLinesCoverageData {
	found: number;
	hit: number;
	details: IRawLineCoverageDetail[];
}
export interface IRawFunctionsCoverageData {
	found: number;
	hit: number;
	details: {
		name: string;
		line: number;
		hit: number;
	}[];
}
export interface IRawBranchCoverageDetail {
	line: number;
	block: number;
	branch: number;
	taken: number;
}
export interface IRawBranchesCoverageData {
	found: number;
	hit: number;
	details: IRawBranchCoverageDetail[];
}
export interface IRawCoverageData {
	lines: IRawLinesCoverageData;
	functions: IRawFunctionsCoverageData;
	branches: IRawBranchesCoverageData;
	title: string;
	file: string;
}
export interface ICoverageData {
	lines: IRawLinesCoverageData;
	functions: IRawFunctionsCoverageData;
	branches: IRawBranchesCoverageData;
	title: string;
	uri: vscode.Uri;
}

function _load(filePath:string): Promise<ICoverageData[]> {
	log.info('Reading ' + filePath);

	return pReadFile(filePath).then((data) => {
		return pParse(data.toString()).then((data: IRawCoverageData[]) => {
			return data.map((entry) => {
				let uri = vscode.Uri.file(entry.file);
				return {
					lines: entry.lines,
					functions: entry.functions,
					branches: entry.branches,
					title: entry.title,
					uri: uri
				}
			})
		});
	});
}

interface ICacheEntry {
	data: ICoverageData[];
	key: number;
}
var cache: {[filePath:string]:ICacheEntry;} = {};

export interface ILoadResult {
	filePath: string;
	data: ICoverageData[];
}
export function loadOne(filePath:string): Promise<ILoadResult> {
	if (filePath === null) {
		return Promise.reject<ILoadResult>(new Error('Bad Path'));
	}

	return pStat(filePath).then((stats) => {
		let myKey = stats.mtime.getTime();

		let cacheEntry = cache[filePath];
		if (cacheEntry) {
			if (cacheEntry.key === myKey) {
				log.debug('Cache hit for ' + filePath);
				return {
					filePath: filePath,
					data: cacheEntry.data
				}
			}
		}

		return _load(filePath).then((data) => {
			let cacheEntry:ICacheEntry = {
				data: data,
				key: myKey
			};
			cache[filePath] = cacheEntry;
			return {
				filePath: filePath,
				data: cacheEntry.data
			};
		});
	}).then(null, (err) => {
		log.error(err);
		return {
			filePath: filePath,
			data: []
		}
	});
}

export function loadMany(uris:vscode.Uri[]): Promise<ILoadResult[]> {
	let promises:Promise<ILoadResult>[] = uris.map(filePath => loadOne(filePath.fsPath));
	return Promise.all<ILoadResult>(promises);
}
