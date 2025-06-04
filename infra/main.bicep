@description('Deploy SWA, Functions, Storage, Key Vault for GPT-image-1 app')
param location string = resourceGroup().location
param environmentName string = 'dev'

var storageAccountName = toLower('${environmentName}imgstore')
var functionName = '${environmentName}-func-api'
var staticSiteName = '${environmentName}-staticapp'
var keyVaultName = toLower('${environmentName}-kv')

resource storage 'Microsoft.Storage/storageAccounts@2021-02-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    encryption: {
      services: {
        blob: { enabled: true }
        file: { enabled: true }
      }
      keySource: 'Microsoft.Storage'
    }
  }
  tags: {
    environment: environmentName
  }
}

// Cosmos DB for prompt history
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
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
    enableFreeTier: true
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
  tags: {
    environment: environmentName
  }
}

resource kv 'Microsoft.KeyVault/vaults@2021-06-01-preview' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    enablePurgeProtection: true
    publicNetworkAccess: 'Disabled'
  }
  tags: {
    environment: environmentName
  }
}

// Cosmos DB endpoint secret in Key Vault
resource cosmosEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2021-06-01-preview' = {
  name: 'CosmosDB-Endpoint'
  parent: kv
  properties: {
    value: cosmosDb.properties.documentEndpoint
  }
}

resource hostingPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${functionName}-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: false
  }
  kind: 'functionapp'
}

resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  kind: 'functionapp'
  properties: {
    httpsOnly: true
    serverFarmId: hostingPlan.id
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
      ]
    }
  }
  tags: {
    environment: environmentName
  }
}

resource kvAccess 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, kv.id, 'kv-access')
  scope: kv
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '47274124-5e10-4c24-bfbe-bbf5a179592b')
    principalId: functionApp.identity.principalId
  }
}

resource storageAccess 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, storage.id, 'storage-blob-role')
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: functionApp.identity.principalId
  }
}

// Cosmos DB Data Contributor role for Function App
resource cosmosAccess 'Microsoft.Authorization/roleAssignments@2020-04-01-preview' = {
  name: guid(functionApp.name, cosmosDb.id, 'cosmos-contributor-role')
  scope: cosmosDb
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
    principalId: functionApp.identity.principalId
  }
}

resource staticApp 'Microsoft.Web/staticSites@2020-12-01' = {
  name: staticSiteName
  location: 'eastasia'
  properties: {
    repositoryToken: 'REPO_TOKEN_PLACEHOLDER'
    buildProperties: {
      appLocation: 'app'
      apiLocation: 'api'
      outputLocation: ''
    }
  }
  tags: {
    environment: environmentName
  }
}

output functionEndpoint string = functionApp.properties.defaultHostName
output staticUrl string = staticApp.properties.defaultHostname
output cosmosEndpoint string = cosmosDb.properties.documentEndpoint
output cosmosAccountName string = cosmosDb.name
