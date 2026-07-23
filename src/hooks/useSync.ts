'use client'

import { useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { toast } from 'sonner'

export function useSync() {
  const syncOfflineData = useCallback(async () => {
    try {
      const items = await db.sync_queue.orderBy('timestamp').toArray()
      
      if (items.length === 0) return

      // Attempt to sync to the server
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      })

      if (response.ok) {
        // Clear the synced items from the queue
        const itemIds = items.map(item => item.id as number)
        await db.sync_queue.bulkDelete(itemIds)
        console.log(`Successfully synced ${items.length} items to schema.ai server.`)
        toast.success('Offline progress saved to cloud!')
      } else {
        const errorData = await response.json()
        console.error('Failed to sync offline data to server:', errorData)
        toast.error(`Sync Failed: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error: any) {
      console.error('Network error during sync:', error)
      toast.error(`Network Error: ${error.message}`)
    }
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      console.log('App is online. Attempting to sync offline data...')
      syncOfflineData()
    }

    window.addEventListener('online', handleOnline)

    // Attempt to sync initially if we're already online
    if (typeof window !== 'undefined' && window.navigator.onLine) {
      syncOfflineData()
    }

    return () => window.removeEventListener('online', handleOnline)
  }, [syncOfflineData])

  return {
    syncOfflineData,
  }
}

export async function queueAction(action: string, payload: any) {
  try {
    await db.sync_queue.add({
      action,
      payload,
      timestamp: Date.now()
    })
    console.log(`Queued action: ${action}`)
    
    // Attempt sync immediately if online
    if (typeof window !== 'undefined' && window.navigator.onLine) {
      window.dispatchEvent(new Event('online'))
    }
  } catch (error) {
    console.error('Failed to queue action:', error)
  }
}
