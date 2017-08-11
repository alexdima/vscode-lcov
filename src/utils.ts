'use strict';

interface ICallbackFunc<T, R> {
	(arg: T, cb: (err: any, result: R) => void): void;
}

interface IPromiseFunc<T, R> {
	(arg: T): Promise<R>;
}

export function toPromiseFunc<T, R>(target: ICallbackFunc<T, R>): IPromiseFunc<T, R> {
	return (arg: T) => {
		return new Promise<R>((c, e) => {
			target(arg, (err, data) => {
				if (err) {
					e(err);
				} else {
					c(data);
				}
			});
		});
	}
}
