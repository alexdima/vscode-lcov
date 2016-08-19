'use strict';

import * as vscode from 'vscode';

import {log as _log} from './logger';

export class UriWatcher {

	private static _instanceCnt = 0;
	
	private log = _log.bind('UriWatcher' + (++UriWatcher._instanceCnt));
	private _watcher: vscode.FileSystemWatcher;

	constructor(globPattern:string, uris:vscode.Uri[], run:()=>void) {
		this._watcher = vscode.workspace.createFileSystemWatcher(globPattern, false, false, false);

		let watching = uris.map(uri => uri.fsPath);
		this.log.info('Watching ' + globPattern + ': ' + watching.join(', '));

		let maybeUpdate = (affectedPath:vscode.Uri) => {
			let path = affectedPath.fsPath;
			if (watching.indexOf(path) >= 0) {
				this.log.debug('Firing due to event ' + path);
				run();
			} else {
				this.log.debug('Ignoring event ' + path);
			}
		};

		this._watcher.onDidChange(maybeUpdate);
		this._watcher.onDidCreate(maybeUpdate);
		this._watcher.onDidDelete(maybeUpdate);
	}

	public dispose(): void {
		this._watcher.dispose();
		this.log.info('Stopped.');
	}
}
