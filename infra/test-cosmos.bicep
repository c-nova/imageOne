@description('Minimal CosmosDB deployment for testing')
param location string = resourceGroup().location
param environmentName string = 'minimal'

// Generate unique resource name
var resourceToken = uniqueString(subscription().id, resourceGroup().id, environmentName)
var cosmosDbName = toLower('${environmentName}-cosmos-${resourceToken}')

// Cosmos DB minimal configuration
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: cosmosDbName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
    enableFreeTier: true
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

// Required AZD outputs
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = subscription().tenantId
output AZURE_SUBSCRIPTION_ID string = subscription().subscriptionId
output RESOURCE_GROUP_ID string = resourceGroup().id

// Cosmos DB outputs
output cosmosEndpoint string = cosmosDb.properties.documentEndpoint
output cosmosAccountName string = cosmosDb.name
