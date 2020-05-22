import request from 'http-async';
import he from 'he';

let GFYCAT_TOKEN = undefined;
let TOKEN_ISSUED = undefined;

export default class JokeHandler {
    constructor() { }
    async getJoke() {
        let resp = await request('GET', 'https://www.hahaha.de/witze/zufallswitz.txt.php')
        let html = resp.content;

        html = html.replace(/<[^>]*>/g, '')
        html = he.decode(html);
        html = html.replace("HAHAHA.DE Witze Portal", "");

        return html;
    }

    async getGif(q) {
        let resp = await request('GET', `https://api.tenor.com/v1/random?q=${encodeURI(q || "gif")}&locale=de_DE&media_filter=minimal&limit=1`);
        
        if(!resp.content.results || resp.content.results.length === 0) {
            console.log(resp)
            return ""
        }
        return resp.content.results[0].url;
    }
}