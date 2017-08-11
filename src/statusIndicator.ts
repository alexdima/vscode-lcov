import * as vscode from 'vscode';
import { DataBank } from './dataBank';
import { Enablement } from './enablement';

const elegantSpinner = require('elegant-spinner');
const spinner = elegantSpinner();


export class StatusIndicator {
    private _statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    private _interval: NodeJS.Timer;
    constructor(private dataBanck: DataBank) {
        vscode.window.onDidChangeActiveTextEditor(() => this.display());
        dataBanck.onDidChange(() => this.display())
        dataBanck.onProcessingChange(() => this.display())
        this.display();
    }

    dispose() {
        this._statusBarItem.dispose();
    }

    display() {
        if (this.dataBanck.isProcessing) {
            this.displayProcessingCoverage();
        } else {
            this.displayFileCoverageSummary()
        }

    }
    private displayProcessingCoverage() {
        this.clearProcessingInterval();
        this._statusBarItem.tooltip = 'processing coverage file'
        this._statusBarItem.show();
        this._interval = setInterval(() => {
            this._statusBarItem.text = `Coverage: ${spinner()}`;
        }, 50);

    }
    private clearProcessingInterval() {
        if (this._interval) {
            clearInterval(this._interval);
        }
    }
    private displayFileCoverageSummary() {
        this.clearProcessingInterval();

        if (vscode.window.activeTextEditor) {
            let msg = "Coverage: ";
            let info = this.dataBanck.get(vscode.window.activeTextEditor.document.uri);
            if (info) {
                msg += `lines: ${format(info.lines)}% branches: ${format(info.branches)}% functions: ${format(info.functions)}% `;

            } else {
                msg += "No Info";
            }
            let file = vscode.workspace.asRelativePath(vscode.window.activeTextEditor.document.uri);
            this._statusBarItem.tooltip = file;
            this._statusBarItem.text = msg;
            this._statusBarItem.command = 'lcov.displayCoverageEditorDecorator';
            this._statusBarItem.show();
        } else {
            this._statusBarItem.hide();
        }
    }
}

function format(entry: { hit: number, found: number }) {
    let coverage = entry.hit / entry.found * 100;
    return parseFloat(coverage.toFixed(2));
}