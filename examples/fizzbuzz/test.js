'use strict';

var fizzbuzz = require('./main').fizzbuzz;
var assert = require('assert');

function testFizzBuzz(n, expected) {
	assert.equal(fizzbuzz(n), expected);
}

describe('fizzbuzz', () => {
	it("should fizzbuzz", () => {
		testFizzBuzz(1, '');
		testFizzBuzz(3, 'Fizz');
		testFizzBuzz(5, 'Buzz');
		testFizzBuzz(15, 'FizzBuzz');
	});
});
