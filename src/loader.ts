'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
var parse = require('lcov-parse');

import { LOG } from './logger';
import { toPromiseFunc } from './utils';
import { FileCache } from './fileCache';
import { IDirectoryData } from './configuration';

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

	public async get(uri: vscode.Uri, directoryConf: IDirectoryData): Promise<ILoadResult> {
		const fsPath = uri.fsPath;

		try {
			return await super.get(uri, directoryConf);
		} catch (err) {
			log.error(err);
			return {
				filePath: fsPath,
				data: null
			};
		}
	}

	protected async _get(uri: vscode.Uri, directoryData: IDirectoryData): Promise<ILoadResult> {
		const fsPath = uri.fsPath;

		log.info('Reading ' + fsPath);

		const buf = await pReadFile(fsPath);
		const data = <IRawCoverageData[]>await pParse(buf.toString());
		return {
			filePath: fsPath,
			data: data.map((entry) => {
				if (directoryData.override.path && directoryData.override.with) {
					entry.file = entry.file.replace(directoryData.override.path, directoryData.override.with);
				}

				if (directoryData.windowsify) {
					entry.file = entry.file.replace("/", "\\");
				}

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
	}

}

export function loadMany(uris: vscode.Uri[], directoryConf: IDirectoryData): Promise<ILoadResult[]> {
	let promises: Promise<ILoadResult>[] = uris.map(uri => LcovCache.INSTANCE.get(uri, directoryConf));
	return Promise.all<ILoadResult>(promises);
}
