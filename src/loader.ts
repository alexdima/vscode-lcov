'use strict';

import * as fs from 'fs';
var parse = require('lcov-parse');

import {LOG} from './logger';

const log = LOG('Loader');

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
	title:string;
	file:string;
}

interface ICallbackFunc<T,R> {
	(arg:T, cb:(err:any, result:R)=>void): void;
}
interface IPromiseFunc<T,R> {
	(arg:T): Promise<R>;
}
function toPromiseFunc<T,R>(target:ICallbackFunc<T,R>): IPromiseFunc<T,R> {
	return (arg:T) => {
		return new Promise<R>((c, e) => {
			target(arg, (err, data) => {
				if(err) {
					e(err);
				} else {
					c(data);
				}
			});
		});
	}
}

const pReadFile = toPromiseFunc(fs.readFile);
const pParse = toPromiseFunc(parse);
const pStat = toPromiseFunc(fs.stat);

function _load(filePath:string): Promise<IRawCoverageData[]> {
	log.info('Reading ' + filePath);

	return pReadFile(filePath).then((data) => {
		return pParse(data.toString());
	});
}

interface ICacheEntry {
	data: IRawCoverageData[];
	key: number;
}
var cache: {[filePath:string]:ICacheEntry;} = {};

export interface ILoadResult {
	filePath:string;
	data:IRawCoverageData[];
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

export function loadMany(filePaths:string[]): Promise<ILoadResult[]> {
	let promises:Promise<ILoadResult>[] = filePaths.map(filePath => loadOne(filePath));
	return Promise.all<ILoadResult>(promises);
}
