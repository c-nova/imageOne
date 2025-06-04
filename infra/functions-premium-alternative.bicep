// Alternative: Premium plan for high-performance scenarios
// 高パフォーマンス要求時の代替設定

resource hostingPlanPremium 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${functionName}-premium-plan'
  location: location
  sku: {
    name: 'EP1'
    tier: 'ElasticPremium'
  }
  properties: {
    reserved: false
    maximumElasticWorkerCount: 20 // 最大インスタンス数
  }
  kind: 'elastic'
}

resource functionAppPremium 'Microsoft.Web/sites@2023-01-01' = {
  name: functionName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  kind: 'functionapp'
  properties: {
    httpsOnly: true
    serverFarmId: hostingPlanPremium.id
    siteConfig: {
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: storage.properties.primaryEndpoints.blob
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~18'
        }
        {
          name: 'KeyVaultName'
          value: kv.name
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        // プリウォーミング設定
        {
          name: 'WEBSITE_WARMUP_PATH'
          value: '/api/health'
        }
      ]
      // Always On相当の設定
      alwaysOn: true
      // プリウォーミングインスタンス数
      preWarmedInstanceCount: 1
      // 関数タイムアウト（Premium では無制限）
      functionAppScaleLimit: 20
    }
  }
  tags: {
    environment: environmentName
  }
}

// ヘルスチェック用のシンプルな関数を追加
resource healthFunction 'Microsoft.Web/sites/functions@2023-01-01' = {
  name: 'health'
  parent: functionAppPremium
  properties: {
    config: {
      bindings: [
        {
          authLevel: 'anonymous'
          type: 'httpTrigger'
          direction: 'in'
          name: 'req'
          methods: ['get']
          route: 'health'
        }
        {
          type: 'http'
          direction: 'out'
          name: 'res'
        }
      ]
    }
    files: {
      'index.js': 'module.exports = async function (context, req) { context.res = { status: 200, body: "OK" }; };'
    }
  }
}
