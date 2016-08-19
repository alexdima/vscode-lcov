'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as vm from 'vm';
import * as cp from 'child_process';

import {Configuration} from './configuration';
import {UriWatcher} from './uriWatcher';
import {LOG} from './logger';

const log = LOG('SourceFileWatcher');

export class SourceFileWatcher {

	private _config:Configuration;
	private _uri:vscode.Uri;
	public get uri() { return this._uri; }

	private _watcher: UriWatcher;
	private _runTimeout: number;

	constructor(config:Configuration, uri:vscode.Uri) {
		this._config = config;
		this._uri = uri;

		let fileExtension = path.extname(uri.fsPath);
		this._watcher = new UriWatcher("**/*" + fileExtension, [uri], () => this._runSoon());
		this._runTimeout = null;
	}

	private _runSoon(): void {
		if (this._runTimeout) {
			return;
		}
		this._runTimeout = setTimeout(() => {
			this._runTimeout = null;
			this._run();
		}, 150);
	}

	private _run(): void {
		let workspaceRoot = vscode.workspace.rootPath;
		let file = vscode.workspace.asRelativePath(this._uri);
		let hadError = false;

		let command = this._config.watcherExec.replace(/\${([^}]+)}/g, (_, expr) => {
			let sourceCode = `(function(workspaceRoot, file, path) { return ${expr}; })`;
			try {
				let func = <any>vm.runInThisContext(sourceCode);
				return func.call(null, workspaceRoot, file, path);
			} catch(err) {
				log.error(err);
				hadError = true;
				return '';
			}
		});

		if (hadError) {
			return;
		}

		log.info('executing ' + command);

		cp.exec(command, {
			cwd: workspaceRoot
		}, (err, stdout, stderr) => {
			log.info('process finished.');
			if (err) {
				log.error(String(err));
				return;
			}
		});
	}

	public dispose(): void {
		this._watcher.dispose();
		if (this._runTimeout) {
			clearTimeout(this._runTimeout);
			this._runTimeout = null;
		}
	}
}
