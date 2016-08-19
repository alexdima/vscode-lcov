'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

export class Configuration {

	private _path: string;
	private _overwritingPath: string;
	private _watcherExec: string;

	public get relativePath(): string {
		return this._path;
	}
	public get absolutePath(): string {
		return path.join(vscode.workspace.rootPath, this._path);
	}

	public get relativeOverwritingPath(): string {
		return this._overwritingPath;
	}
	public get absoluteOverwritingPath(): string {
		return this._overwritingPath !== null ? path.join(vscode.workspace.rootPath, this._overwritingPath) : null;
	}

	public get watcherExec(): string {
		return this._watcherExec;
	}

	constructor() {
		let conf = vscode.workspace.getConfiguration('lcov');
		this._path = conf['path'];
		this._overwritingPath = conf['overwritingPath'];

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
			&& this._path === other._path
			&& this._overwritingPath === other._overwritingPath
			&& this._watcherExec === other._watcherExec
		);
	}
}