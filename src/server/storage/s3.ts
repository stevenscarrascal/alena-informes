/**
 * Almacenamiento de los archivos de los informes en S3 (AWS o compatible).
 *
 * El bucket es privado y nunca se expone al navegador: todo el acceso pasa por
 * `/api/public/r/{token}/…`, que además sanea el HTML antes de servirlo. Por eso
 * no se usan URLs prefirmadas para lectura.
 *
 * Disposición de claves: {areaId}/{slug}-{timestamp}/{ruta/dentro/del/zip}
 */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import { s3Config } from "@/server/env";

const globalForS3 = globalThis as unknown as { __alenaS3?: S3Client; __alenaS3Bucket?: string };

function client(): S3Client {
  if (!globalForS3.__alenaS3) {
    const cfg = s3Config();
    const options: S3ClientConfig = {
      region: cfg.region,
      credentials: cfg.credentials,
      forcePathStyle: cfg.forcePathStyle,
      // El SDK v3 firma con checksums CRC32 por defecto. DeleteObjects exige
      // Content-MD5 por spec de S3, y varios compatibles (Herd, DigitalOcean
      // Spaces) no cubren el CRC32 opcional: sin esto, el borrado en lote
      // falla con "Missing required header for this request: Content-Md5".
      requestChecksumCalculation: "WHEN_REQUIRED",
    };
    if ("endpoint" in cfg && cfg.endpoint) options.endpoint = cfg.endpoint;
    globalForS3.__alenaS3 = new S3Client(options);
    globalForS3.__alenaS3Bucket = cfg.bucket;
  }
  return globalForS3.__alenaS3;
}

function bucket(): string {
  client();
  return globalForS3.__alenaS3Bucket!;
}

export async function putObject(
  path: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: path,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Devuelve el contenido del objeto, o null si no existe. */
export async function getObject(
  path: string,
): Promise<{ body: Buffer; contentType: string | undefined } | null> {
  try {
    const result = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: path }));
    if (!result.Body) return null;
    const bytes = await result.Body.transformToByteArray();
    return { body: Buffer.from(bytes), contentType: result.ContentType };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === "NoSuchKey" || name === "NotFound";
}

/**
 * Borra recursivamente todo lo que cuelga de un prefijo.
 *
 * Corrige el comportamiento anterior: `storage.list()` de Supabase solo
 * devolvía un nivel, así que los archivos en subcarpetas del ZIP quedaban
 * huérfanos al eliminar un informe. ListObjectsV2 sí es recursivo.
 */
export async function deleteByPrefix(prefix: string): Promise<number> {
  const s3 = client();
  const fullPrefix = `${prefix.replace(/\/+$/, "")}/`;
  let continuationToken: string | undefined;
  let deleted = 0;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: fullPrefix,
        ContinuationToken: continuationToken,
      }),
    );

    const keys = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));

    if (keys.length) {
      // DeleteObjects acepta como máximo 1000 claves por llamada, que es
      // justo el tope de página de ListObjectsV2.
      //
      // ChecksumAlgorithm: "MD5" es necesario a propósito. DeleteObjects
      // siempre exige un checksum; el SDK v3 usa CRC32 por defecto
      // (cabecera x-amz-checksum-crc32), pero varios compatibles de S3
      // (Herd, DigitalOcean Spaces) no lo reconocen y responden
      // "Missing required header for this request: Content-Md5". Forzar
      // MD5 hace que el SDK mande esa cabecera clásica, que sí entienden.
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          ChecksumAlgorithm: "MD5",
        }),
      );
      deleted += keys.length;
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return deleted;
}
