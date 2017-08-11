'use strict';

import * as vscode from 'vscode';

import { Configuration } from './configuration';
import { CoverageReportProvider } from './coverageReportProvider';
import { Controller } from './controller';
import { initLog, LOG } from './logger';

const log = LOG('main');

let controller: Controller = null;

export function activate(context: vscode.ExtensionContext) {

	initLog(context);

	log.info('Starting up...');

	if (!vscode.workspace.rootPath) {
		log.info('This extension does not work unless you open a folder.');
		log.info('Shutting down...');
		vscode.commands.registerCommand('lcov.menu', () => {
			vscode.window.showWarningMessage('LCOV only works if you open a folder.');
		});
		return;
	}

	CoverageReportProvider.init(context);

	let config: Configuration = null;

	let checkUpdateConfig = () => {
		let newConfig = new Configuration();
		if (!newConfig.equals(config)) {
			config = newConfig;
			if (controller) {
				controller.dispose();
			}
			controller = new Controller(config);
		}
	};

	vscode.workspace.onDidChangeConfiguration(checkUpdateConfig);
	checkUpdateConfig();

	vscode.commands.registerCommand('lcov.menu', () => {
		controller.showMenu();
	});
}

export function deactivate() {
	controller.dispose();
}
