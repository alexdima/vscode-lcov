'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
var parse = require('lcov-parse');
var lcovSourcemap = require('lcov-sourcemap');

import {LOG} from './logger';
import {toPromiseFunc} from './utils';
import {FileCache} from './fileCache';

const log = LOG('Loader');
const pReadFile = toPromiseFunc(fs.readFile);
const pParse = toPromiseFunc(parse);

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

export interface ILoadResult {
	filePath: string;
	data: ICoverageData[];
}

class LcovCache extends FileCache<ILoadResult> {

	public static INSTANCE = new LcovCache();

	public get(uri:vscode.Uri): Promise<ILoadResult> {
		let fsPath = uri.fsPath;

		return super.get(uri).then(null, (err) => {
			log.error(err);
			return {
				filePath: fsPath,
				data: null
			};
		});
	}

	protected _get(uri:vscode.Uri): Promise<ILoadResult> {
		let fsPath = uri.fsPath;

		log.info('Reading ' + fsPath);

		return pReadFile(fsPath).then((buf) => {
			return pParse(buf.toString()).then((data: IRawCoverageData[]) => {
				return {
					filePath: fsPath,
					data: data.map((entry) => {
						let uri = vscode.Uri.file(entry.file);
						return {
							lines: entry.lines,
							functions: entry.functions,
							branches: entry.branches,
							title: entry.title,
							uri: uri
						}
					})
				};
			});
		});
	}

}

export function loadMany(uris:vscode.Uri[]): Promise<ILoadResult[]> {
	let promises:Promise<ILoadResult>[] = uris.map(uri => LcovCache.INSTANCE.get(uri));
	return Promise.all<ILoadResult>(promises);
}
