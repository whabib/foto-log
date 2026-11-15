/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../util'
import type * as ComFotoLogPhoto from './photo'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.foto-log.profile'

export interface Main {
  $type: 'com.foto-log.profile'
  titleImage?: Image
  wallpaper?: Image
  /** How the wallpaper fills the page: 'tile' repeats it at its natural size, 'fill' covers the window. */
  wallpaperMode?: 'tile' | 'fill' | (string & {})
  avatar?: Image
  updatedAt: string
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

export interface Image {
  $type?: 'com.foto-log.profile#image'
  image: BlobRef
  aspectRatio?: ComFotoLogPhoto.AspectRatio
}

const hashImage = 'image'

export function isImage<V>(v: V) {
  return is$typed(v, id, hashImage)
}

export function validateImage<V>(v: V) {
  return validate<Image & V>(v, id, hashImage)
}
