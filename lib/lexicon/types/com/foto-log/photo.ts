/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../util.js'
import type * as ComAtprotoRepoStrongRef from '../atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.foto-log.photo'

export interface Main {
  $type: 'com.foto-log.photo'
  post: ComAtprotoRepoStrongRef.Main
  image: BlobRef
  /** Alt text describing the image. */
  alt?: string
  aspectRatio?: AspectRatio
  caption?: string
  /** Calendar date (YYYY-MM-DD) the photo was posted, in the poster's time zone. The record key starts with this date. */
  uploadDate: string
  /** Calendar date (YYYY-MM-DD) the photo is shown under. Always equals uploadDate for now. */
  displayDate: string
  /** IANA time zone name of the poster when the photo was posted, e.g. America/New_York. */
  timeZone: string
  createdAt: string
  [k: string]: unknown
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain, true)
}

export {
  type Main as Record,
  isMain as isRecord,
  validateMain as validateRecord,
}

/** Width and height of the image. Only the ratio matters. */
export interface AspectRatio {
  $type?: 'com.foto-log.photo#aspectRatio'
  width: number
  height: number
}

const hashAspectRatio = 'aspectRatio'

export function isAspectRatio<V>(v: V) {
  return is$typed(v, id, hashAspectRatio)
}

export function validateAspectRatio<V>(v: V) {
  return validate<AspectRatio & V>(v, id, hashAspectRatio)
}
