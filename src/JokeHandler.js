import request from 'http-async';
import he from 'he';

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
        let resp = await request('GET', `https://api.giphy.com/v1/gifs/search?api_key=mqc2ec9uDPRvpUen6D6ENgi4ur5sPiIv&q=${encodeURI(q)}`);
        let data = resp.content.data
        return data[Math.floor(Math.random() * data.length)].images.downsized_large.url;
    }
}