import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { PutCommand, DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ region: process.env.AWS_REGION_NAME || 'ap-south-1' })
const docClient = DynamoDBDocumentClient.from(client)

const TABLE_NAME = process.env.WS_CONNECTIONS_TABLE || 'cloud-automation-ws-connections'

export const connect = async (event) => {
  const connectionId = event.requestContext.connectionId

  try {
    // TTL set for 24 hours to automatically purge dead connections
    const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60)
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        connectionId,
        ttl
      }
    }))
    
    console.log(`[WebSocket] Connected: ${connectionId}`)
    return { statusCode: 200, body: 'Connected.' }
  } catch (err) {
    console.error('WebSocket Connect Error:', err)
    return { statusCode: 500, body: 'Failed to connect.' }
  }
}

export const disconnect = async (event) => {
  const connectionId = event.requestContext.connectionId

  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { connectionId }
    }))
    
    console.log(`[WebSocket] Disconnected: ${connectionId}`)
    return { statusCode: 200, body: 'Disconnected.' }
  } catch (err) {
    console.error('WebSocket Disconnect Error:', err)
    return { statusCode: 500, body: 'Failed to disconnect.' }
  }
}
