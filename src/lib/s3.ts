import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

function getS3Config() {
	const endpoint = process.env.S3_ENDPOINT;
	const region = process.env.S3_REGION || "auto";
	const bucket = process.env.S3_BUCKET;
	const accessKeyId = process.env.S3_ACCESS_KEY_ID;
	const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
	const publicUrl = process.env.S3_PUBLIC_URL;

	if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
		return null;
	}

	return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicUrl };
}

let client: S3Client | null = null;

function getClient(): S3Client | null {
	if (client) return client;
	const config = getS3Config();
	if (!config) return null;

	client = new S3Client({
		endpoint: config.endpoint,
		region: config.region,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
		forcePathStyle: true,
	});

	return client;
}

export async function uploadFile(
	data: Buffer | Uint8Array,
	options: {
		folder?: string;
		contentType: string;
		extension: string;
	},
): Promise<string | null> {
	const s3 = getClient();
	const config = getS3Config();
	if (!s3 || !config) return null;

	const fileKey = `${options.folder || "guidebook"}/${nanoid()}${options.extension}`;

	await s3.send(
		new PutObjectCommand({
			Bucket: config.bucket,
			Key: fileKey,
			Body: data,
			ContentType: options.contentType,
			ACL: "public-read",
		}),
	);

	if (config.publicUrl) {
		return `${config.publicUrl}/${fileKey}`;
	}
	return `${config.endpoint}/${config.bucket}/${fileKey}`;
}

export function isS3Configured(): boolean {
	return getS3Config() !== null;
}
