'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

interface IRawOSWatchData {
	pattern?: string;
	command?: string;
}

interface IRawWatchData extends IRawOSWatchData {
	osx?: IRawOSWatchData;
	windows?: IRawOSWatchData;
	linux?: IRawOSWatchData;
}

export interface IWatchData {
	pattern: string;
	command: string;
}

interface IRawOSWatchData {
	pattern?: string;
	command?: string;
}

/*interface IRawDirectoryOverrideData {
	path?: string;
	with?: string;
}

interface IRawDirectoryData {
	windowsify?: boolean;
	override?: IRawDirectoryOverrideData;
}*/

export interface IDirectoryOverrideData {
	path: string;
	with: string;
}

export interface IDirectoryData {
	windowsify: boolean;
	override: IDirectoryOverrideData;
}

export enum BranchCoverage {
	Off = 0,
	Simple = 1,
	Full = 2
};

export class Configuration {

	private _paths: vscode.Uri[];
	private _sourceMaps: boolean;
	private _branchCoverage: BranchCoverage;
	private _watchConf: IWatchData[];
	private _directoryConf: IDirectoryData;

	public get paths(): vscode.Uri[] {
		return this._paths;
	}

	public get sourceMaps(): boolean {
		return this._sourceMaps;
	}

	public get branchCoverage(): BranchCoverage {
		return this._branchCoverage;
	}

	public get watchConf(): IWatchData[] {
		return this._watchConf;
	}

	public get directoryConf(): IDirectoryData {
		return this._directoryConf;
	}

	constructor() {
		let conf = vscode.workspace.getConfiguration('lcov');

		let rawPaths = <string | string[]>conf['path'];
		let paths: string[];
		if (Array.isArray(rawPaths)) {
			paths = rawPaths;
		} else {
			paths = [rawPaths];
		}

		this._paths = paths.map(p => vscode.Uri.file(path.join(vscode.workspace.rootPath, p)));

		this._sourceMaps = Boolean(conf['sourceMaps']);

		if (conf['branchCoverage'] === 'full') {
			this._branchCoverage = BranchCoverage.Full;
		} else if (conf['branchCoverage'] === 'simple') {
			this._branchCoverage = BranchCoverage.Simple;
		} else {
			this._branchCoverage = BranchCoverage.Off;
		}

		this._directoryConf = conf['directory'];

		this._watchConf = conf['watch'].map((watchConf: IRawWatchData) => {
			let osOverride: IRawOSWatchData = null;
			if (/^win/.test(process.platform)) {
				osOverride = watchConf.windows;
			} else if ('darwin' === process.platform) {
				osOverride = watchConf.osx;
			} else {
				osOverride = watchConf.linux;
			}

			if (!osOverride) {
				osOverride = {
					pattern: null,
					command: null
				};
			}

			return {
				pattern: osOverride.pattern || watchConf.pattern,
				command: osOverride.command || watchConf.command
			};
		});
	}

	public equals(other: Configuration) {
		return (
			other
			&& Configuration._uriArrayEquals(this._paths, other._paths)
			&& this._sourceMaps === other._sourceMaps
			&& Configuration._watchConfArrayEquals(this._watchConf, other._watchConf)
			&& Configuration._directoryConfEquals(this._directoryConf, other._directoryConf)
		);
	}

	private static _uriArrayEquals(a: vscode.Uri[], b: vscode.Uri[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0, len = a.length; i < len; i++) {
			if (a[i].toString() !== b[i].toString()) {
				return false;
			}
		}
		return true;
	}

	private static _watchConfArrayEquals(a: IWatchData[], b: IWatchData[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0, len = a.length; i < len; i++) {
			if (!this._watchConfEquals(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}

	private static _watchConfEquals(a: IWatchData, b: IWatchData): boolean {
		return (
			a.pattern === b.pattern
			&& a.command === b.command
		);
	}

	private static _directoryConfEquals(a: IDirectoryData, b: IDirectoryData): boolean {
		return (
			a.windowsify === b.windowsify
			&& a.override.path === b.override.path
			&& a.override.with === b.override.with
		);
	}
}
