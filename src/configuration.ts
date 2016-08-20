'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

export class Configuration {

	private _paths: vscode.Uri[];
	private _sourceMaps: boolean;
	private _watcherExec: string;

	public get paths(): vscode.Uri[] {
		return this._paths;
	}

	public get sourceMaps(): boolean {
		return this._sourceMaps;
	}

	public get watcherExec(): string {
		return this._watcherExec;
	}

	constructor() {
		let conf = vscode.workspace.getConfiguration('lcov');

		let rawPaths = <string|string[]>conf['path'];
		let paths:string[];
		if (Array.isArray(rawPaths)) {
			paths = rawPaths;
		} else {
			paths = [rawPaths];
		}

		this._paths = paths.map(p => vscode.Uri.file(path.join(vscode.workspace.rootPath, p)));

		this._sourceMaps = Boolean(conf['sourceMaps']);

		if (/^win/.test(process.platform)) {
			this._watcherExec = conf['watcherExec'].windows;
		} else if ('darwin' === process.platform) {
			this._watcherExec = conf['watcherExec'].osx;
		} else {
			this._watcherExec = conf['watcherExec'].linux;
		}
	}

	public equals(other: Configuration) {
		return (
			other
			&& Configuration._uriArrayEquals(this._paths, other._paths)
			&& this._sourceMaps === other._sourceMaps
			&& this._watcherExec === other._watcherExec
		);
	}

	private static _uriArrayEquals(a:vscode.Uri[], b:vscode.Uri[]): boolean {
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
}
