// Alternative: Provisioned throughput for high-scale scenarios
// 将来的な高スケール対応版

resource cosmosDbProvisioned 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: toLower('${environmentName}-cosmos-db')
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    enableFreeTier: false // プロビジョンドでは無料レベル使えない
    enableAutomaticFailover: true
    enableMultipleWriteLocations: false
    // capabilities配列なし = プロビジョンドモード
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
  tags: {
    environment: environmentName
  }
}

// データベースレベルでのスループット設定例
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  name: 'ImageGenerationDB'
  parent: cosmosDbProvisioned
  properties: {
    resource: {
      id: 'ImageGenerationDB'
    }
    options: {
      // 自動スケーリング設定
      autoscaleSettings: {
        maxThroughput: 4000 // 最大4,000 RU/s
      }
    }
  }
}

// コンテナ（スループット設定なし = データベースレベルを共有）
resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  name: 'PromptHistory'
  parent: database
  properties: {
    resource: {
      id: 'PromptHistory'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
      indexingPolicy: {
        includedPaths: [
          { path: '/*' }
        ]
        excludedPaths: [
          { path: '/imageBase64/*' }
          { path: '/metadata/*' }
        ]
      }
      defaultTtl: 31536000 // 1年
    }
  }
}
