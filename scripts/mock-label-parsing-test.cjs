#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStubElement() {
	return {
		value: '',
		checked: false,
		hidden: false,
		innerHTML: '',
		textContent: '',
		title: '',
		placeholder: '',
		dataset: {},
		style: {},
		className: '',
		classList: {
			toggle() {},
		},
		setAttribute() {},
		appendChild() {},
		addEventListener() {},
		removeEventListener() {},
		getContext() {
			return undefined;
		},
	};
}

function loadHeaderSilkExports(projectRoot) {
	const sourcePath = path.join(projectRoot, 'iframe/js/header-silk.js');
	const source = fs.readFileSync(sourcePath, 'utf8');
	const instrumentedSource = source.replace(
		/\}\)\(\);\s*$/,
		`globalThis.__headerSilkMock = {
	makeSilkLabel,
	parseLabelMappings,
	applyLabelMappingWithMap,
};})();`,
	);

	const documentStub = {
		getElementById() {
			return createStubElement();
		},
		querySelectorAll() {
			return [];
		},
		createElement() {
			return createStubElement();
		},
	};

	const context = {
		console,
		document: documentStub,
		window: {
			addEventListener() {},
		},
		localStorage: {
			getItem() {
				return null;
			},
			setItem() {},
		},
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
		atob(value) {
			return Buffer.from(value, 'base64').toString('binary');
		},
		Blob,
		Uint8Array,
		Map,
		Set,
		Math,
		Promise,
		Date,
		JSON,
		String,
		Number,
		Boolean,
		Array,
		RegExp,
	};
	context.globalThis = context;

	vm.runInNewContext(instrumentedSource, context, { filename: sourcePath });
	return context.__headerSilkMock;
}

function runMockTests() {
	const projectRoot = path.resolve(__dirname, '..');
	const {
		makeSilkLabel,
		parseLabelMappings,
		applyLabelMappingWithMap,
	} = loadHeaderSilkExports(projectRoot);

	const cases = [];
	function test(name, fn) {
		cases.push({ name, fn });
	}

	test('preserves dotted multifunction label bodies', () => {
		assert.equal(makeSilkLabel('P1.1/T2EX', 1), 'P1.1/T2EX');
		assert.equal(makeSilkLabel('GPIO/P1.1/T2EX', 1), 'P1.1/T2EX');
		assert.equal(makeSilkLabel('/foo/P1.1/T2EX', 1), 'P1.1/T2EX');
	});

	test('preserves dotted and slash-delimited pin labels', () => {
		assert.equal(makeSilkLabel('P0.1', 1), 'P0.1');
		assert.equal(makeSilkLabel('/foo/P0.1', 1), 'P0.1');
		assert.equal(makeSilkLabel('P0/1', 1), 'P0/1');
		assert.equal(makeSilkLabel('/foo/P0/1', 1), 'P0/1');
	});

	test('still strips obvious hierarchical prefixes', () => {
		assert.equal(makeSilkLabel('/foo/U1/PA15', 1), 'PA15');
		assert.equal(makeSilkLabel('sheet/U1/PA15', 1), 'PA15');
	});

	test('parses regex literal mappings with escaped slash', () => {
		const mapping = parseLabelMappings(String.raw`/(?:.*?)\/?P(\d)\.(\d)\/?(?:.*?)/=P$1.$2`);
		assert.equal(mapping.patternRules.length, 1);
		assert.equal(applyLabelMappingWithMap(makeSilkLabel('P1.1/T2EX', 1), mapping), 'P1.1');
		assert.equal(applyLabelMappingWithMap(makeSilkLabel('/foo/P1.1/T2EX', 1), mapping), 'P1.1');
	});

	test('parses re: mappings without treating the prefix colon as a separator', () => {
		const mapping = parseLabelMappings(String.raw`re:(?:.*?)\/?P(\d)\.(\d)\/?(?:.*?)=P$1.$2`);
		assert.equal(mapping.patternRules.length, 1);
		assert.equal(applyLabelMappingWithMap(makeSilkLabel('P1.1/T2EX', 1), mapping), 'P1.1');
	});

	test('keeps simple separators working for non-regex mappings', () => {
		const mapping = parseLabelMappings([
			'GND:G',
			'PA*=A$1',
			'USART*_TX=>TX',
		].join('\n'));
		assert.equal(applyLabelMappingWithMap('GND', mapping), 'G');
		assert.equal(applyLabelMappingWithMap('PA15', mapping), 'A15');
		assert.equal(applyLabelMappingWithMap('USART1_TX', mapping), 'TX');
	});

	for (const { name, fn } of cases) {
		fn();
		console.log(`PASS ${name}`);
	}

	console.log(`Mock label tests passed: ${cases.length}`);
}

runMockTests();
