declare module "final-stream" {
	import { Readable } from "node:stream";

	function finalStream(stream: Readable): Promise<Buffer>;
	export = finalStream;
}

declare module "ndjson-fe" {
	import { Transform } from "node:stream";

	interface NdJsonStream extends Transform {
		on(event: "next", listener: (data: unknown) => void): this;
		on(event: "error", listener: (error: Error) => void): this;
		on(event: "end", listener: () => void): this;
	}

	function ndJsonFe(): NdJsonStream;
	export = ndJsonFe;
}
