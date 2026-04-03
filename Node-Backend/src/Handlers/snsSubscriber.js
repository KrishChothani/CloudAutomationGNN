import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { ScanCommand, DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi'

const client = new DynamoDBClient({ region: process.env.AWS_REGION_NAME || 'ap-south-1' })
const docClient = DynamoDBDocumentClient.from(client)
const TABLE_NAME = process.env.WS_CONNECTIONS_TABLE || 'cloud-automation-ws-connections'

export const handler = async (event) => {
  console.log('[SNS Subscriber] Received SNS event:', JSON.stringify(event))

  // Determine the endpoint URL dynamically from an env variable (which serverless provides)
  // Or fallback if not provided
  const endpoint = process.env.WS_API_ENDPOINT
  if (!endpoint) {
    console.error('Missing WS_API_ENDPOINT environment variable.')
    return { statusCode: 500, body: 'Missing WS API Endpoint configuration' }
  }

  const apigwManagementApi = new ApiGatewayManagementApiClient({
    apiVersion: '2018-11-29',
    endpoint: endpoint
  })

  // Group SNS records to extract messages
  const messages = event.Records.map(record => record.Sns.Message)

  // 1. Fetch all connection IDs from DynamoDB
  let connections
  try {
    const scanResponse = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }))
    connections = scanResponse.Items || []
  } catch (err) {
    console.error('Error scanning DynamoDB:', err)
    return { statusCode: 500, body: 'Failed to scan connections.' }
  }

  if (connections.length === 0) {
    console.log('No active WebSocket connections. Skipping.')
    return { statusCode: 200, body: 'No connections' }
  }

  // 2. Broadcast each message to all connections
  const postCalls = []
  
  for (const connection of connections) {
    const connectionId = connection.connectionId
    for (const msg of messages) {
      postCalls.push(
        apigwManagementApi.send(new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(msg) // msg is already a JSON string from SNS
        })).catch(async (err) => {
          // If connection is stale/gone (410 Gone error), delete from DB
          if (err.$metadata && err.$metadata.httpStatusCode === 410) {
            console.log(`[Cleanup] Removing stale connection: ${connectionId}`)
            await docClient.send(new DeleteCommand({
              TableName: TABLE_NAME,
              Key: { connectionId }
            })).catch(deleteErr => console.error('Failed to delete stale connection:', deleteErr))
          } else {
            console.error(`Error sending to ${connectionId}:`, err)
          }
        })
      )
    }
  }

  // Await all parallel post calls
  await Promise.all(postCalls)
  console.log(`[SNS Subscriber] Successfully broadcasted to ${connections.length} clients.`)

  return { statusCode: 200, body: 'Messages broadcasted successfully.' }
}
