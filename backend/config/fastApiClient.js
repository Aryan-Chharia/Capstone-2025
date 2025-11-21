const axios = require('axios');
const FormData = require('form-data');

function isReadableStream(obj) {
	return obj && typeof obj.pipe === 'function' && (typeof obj.read === 'function' || typeof obj._read === 'function');
}

function truncateString(s, n = 200) {
	if (typeof s !== 'string') return s;
	return s.length > n ? `${s.slice(0, n)}... [truncated ${s.length - n} chars]` : s;
}

async function callFastAPIAnalyze(userQuery, fileBuffer, fileName, sessionId) {
	const raw = process.env.FASTAPI_URL || 'http://localhost:8000';
	let urlObj;
	try {
		urlObj = new URL(raw);
	} catch (e) {
		try {
			urlObj = new URL(`http://${raw}`);
		} catch (e2) {
			const msg = `Invalid FASTAPI_URL: ${raw}`;
			console.error(msg);
			throw new Error(msg);
		}
	}

	const normalizedPath = urlObj.pathname.replace(/\/+$/, '') + '/analyze';
	urlObj.pathname = normalizedPath;
	const FASTAPI_URL = urlObj.toString();

	const isBuffer = Buffer.isBuffer(fileBuffer);
	const isStream = isReadableStream(fileBuffer);
	if (!isBuffer && !isStream) throw new Error('fileBuffer must be a Buffer or readable stream');

	const name = (fileName || 'dataset.csv').toLowerCase();
	if (!name.endsWith('.csv')) throw new Error('fileName must have a .csv extension');

	const form = new FormData();
	form.append('user_query', userQuery);
	form.append('file', fileBuffer, { filename: fileName || 'dataset.csv', contentType: 'text/csv' });

	const headers = { ...form.getHeaders() };
	if (sessionId) headers['X-Session-ID'] = sessionId;

	try {
		const resp = await axios.post(FASTAPI_URL, form, {
			headers,
			maxBodyLength: Infinity,
			maxContentLength: Infinity,
			timeout: Number(process.env.FASTAPI_TIMEOUT_MS || 180000),
		});
		return resp.data;
	} catch (err) {
		const respData = err.response?.data;
		const safeRespData = typeof respData === 'string'
			? truncateString(respData, 500)
			: (respData && typeof respData === 'object')
				? Object.keys(respData).length > 0 ? `[object with keys: ${Object.keys(respData).slice(0, 10).join(', ')}]` : '{}'
				: respData;

		console.error('FastAPI call failed:', {
			message: err.message,
			code: err.code,
			status: err.response?.status,
			url: FASTAPI_URL,
			responseData: safeRespData,
		});

		const clientMsg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Error calling FastAPI';
		const e = new Error(clientMsg);
		e.status = err.response?.status;
		e.code = err.code;
		e.cause = err;
		throw e;
	}
}

module.exports = { callFastAPIAnalyze };