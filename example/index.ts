import http from "node:http";

const server = http.createServer((_request, response) => {
	response.end("hello");
});

server.listen(8080);

console.log("Listening on port 8080");
