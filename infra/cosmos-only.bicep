@description('Deploy only CosmosDB for imageOne project')
param location string = resourceGroup().location
param environmentName string = 'dev'

var resourceToken = uniqueString(subscription().id, resourceGroup().id, environmentName)
var cosmosDbName = toLower('${environmentName}-cosmos-${resourceToken}')

// Cosmos DB for prompt history
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: cosmosDbName
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
    'azd-env-name': environmentName
  }
}

// Outputs
output cosmosEndpoint string = cosmosDb.properties.documentEndpoint
output cosmosAccountName string = cosmosDb.name

// Required outputs for azd
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = subscription().tenantId
output AZURE_SUBSCRIPTION_ID string = subscription().subscriptionId
output RESOURCE_GROUP_ID string = resourceGroup().id
