'use strict';
const API = 'https://www.call2all.co.il/ym/api/';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function validDuration(value) {
  const number = Number(value); if (Number.isFinite(number)) return number > 0;
  const match = String(value ?? '').match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return false;
  const seconds = match[3] ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0;
}
class YemotClient {
  constructor(config, fetchImpl = fetch) { this.config = config; this.fetch = fetchImpl; this.token = config.yemotToken || ''; this.tokenAt = 0; }
  path(value) {
    const prefix = this.config.yemotPathPrefix || 'ivr2:';
    const clean = String(value).replace(/^\/+/, '').replace(/\\/g, '/').replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '').replace(/^\/+/, '');
    return `${prefix}${clean}`;
  }
  async request(action, params = {}, { retry = false } = {}) {
    const attempts = retry ? this.config.yemotRetryCount + 1 : 1;
    let last;
    for (let i = 0; i < attempts; i++) {
      try {
        const token = await this.getToken(); const url = new URL(action, API);
        for (const [key, value] of Object.entries({ ...params, token })) if (value !== undefined) url.searchParams.set(key, String(value));
        const response = await this.fetch(url);
        if (!response.ok) throw new Error(`Yemot ${action}: HTTP ${response.status}`);
        const data = await response.json();
        if (data.responseStatus !== 'OK') {
          if (/token|login|expired/i.test(`${data.responseStatus || ''} ${data.message || ''}`)) { this.token = ''; if (i + 1 < attempts) continue; }
          throw new Error(`Yemot ${action}: ${data.message || data.responseStatus || 'שגיאה'}`);
        }
        return data;
      } catch (error) { last = error; if (i + 1 >= attempts) break; await sleep(this.config.yemotRetryDelayMs); }
    }
    throw last;
  }
  async getToken() {
    if (this.token && (this.config.yemotToken || Date.now() - this.tokenAt < 55 * 60 * 1000)) return this.token;
    if (!this.config.yemotUsername || !this.config.yemotPassword) throw new Error('חסרים פרטי התחברות לימות');
    const url = new URL('Login', API); url.searchParams.set('username', this.config.yemotUsername); url.searchParams.set('password', this.config.yemotPassword);
    const response = await this.fetch(url); const data = await response.json();
    if (!response.ok || data.responseStatus !== 'OK' || !data.token) throw new Error('התחברות לימות נכשלה');
    this.token = data.token; this.tokenAt = Date.now(); return this.token;
  }
  async downloadFile(filePath) {
    const url = new URL('DownloadFile', API); url.searchParams.set('token', await this.getToken()); url.searchParams.set('path', this.path(filePath));
    const res = await this.fetch(url); if (!res.ok) throw new Error(`DownloadFile HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer()); if (buffer.length < 16 || buffer.subarray(0, 1).toString() === '{') throw new Error('הורדת קובץ מימות נכשלה'); return buffer;
  }
  async uploadFile(filePath, buffer, filename = 'audio.wav') {
    if (!filePath.toLowerCase().endsWith('.wav')) throw new Error('נתיב העלאה חייב להסתיים ב-.wav');
    let last;
    for (let attempt = 0; attempt <= this.config.yemotRetryCount; attempt++) {
      try {
        const form = new FormData(); form.append('token', await this.getToken()); form.append('path', this.path(filePath)); form.append('convertAudio', '1'); form.append('fileUpload', new Blob([buffer]), filename);
        const response = await this.fetch(new URL('UploadFile', API), { method: 'POST', body: form });
        if (!response.ok) { if ([401, 403].includes(response.status)) this.token = ''; throw new Error(`UploadFile HTTP ${response.status}`); }
        const data = await response.json();
        if (/token|login|expired/i.test(`${data.responseStatus || ''} ${data.message || ''}`)) this.token = '';
        if (data.responseStatus !== 'OK' || !validDuration(data.duration)) throw new Error(`UploadFile לא תקין: ${data.message || 'duration חסר/אפס'}`);
        return data;
      } catch (error) { last = error; if (attempt < this.config.yemotRetryCount) await sleep(this.config.yemotRetryDelayMs); }
    }
    throw last;
  }
  async getIVR2Dir(dir) { return this.request('GetIVR2Dir', { path: String(dir).replace(/^\/+/, '') }); }
  async fileAction(action, what, target) {
    const params = { action, what: this.path(what) }; if (target) params.target = this.path(target);
    const data = await this.request('FileAction', params, { retry: action === 'copy' || action === 'move' });
    if (data.success === false || data.reports?.some(report => report.success === false)) throw new Error(`FileAction ${action} נכשל`); return data;
  }
  copyFile(from, to) { return this.fileAction('copy', from, to); }
  moveFile(from, to) { return this.fileAction('move', from, to); }
  deleteFile(path) { return this.fileAction('delete', path); }
}
module.exports = { YemotClient, validDuration };
