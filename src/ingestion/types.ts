export type IngestionIssue = {
  code: string
  severity: 'info' | 'warning' | 'error'
  path: string
  message: string
}

export type EncodedSourceFile = { fileId: string; dataBase64: string }
export type EncodedAssetFile = {
  assetKey: string
  dataBase64: string
  mediaType: string
  originalFileName: string
}

export type IngestionRequestBody = {
  manifest: Record<string, any>
  sourceFiles: EncodedSourceFile[]
  assetFiles?: EncodedAssetFile[]
}

export type ValidatedIngestion = {
  manifest: Record<string, any>
  sourceBytes: Map<string, Uint8Array>
  assetBytes: Map<string, { bytes: Uint8Array; mediaType: string; originalFileName: string }>
  issues: IngestionIssue[]
  hasErrors: boolean
  identityKey: string
}
