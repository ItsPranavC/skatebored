import { useCallback, useEffect } from 'react'
import { useStore } from '@/store/store'
import { useIssueModal } from '@/components/jira'
import { Modal } from '@/components/ui/overlay'
import { IssueView } from './IssueView'

/** Renders the issue modal for ?selectedIssue=KEY on whatever page is showing. */
export function IssueModalHost() {
  const { selectedKey, close } = useIssueModal()
  const issue = useStore((s) => (selectedKey ? s.issues.find((i) => i.key.toLowerCase() === selectedKey.toLowerCase()) : undefined))
  const pushRecent = useStore((s) => s.pushRecent)

  useEffect(() => {
    if (issue) pushRecent({ kind: 'issue', id: issue.id })
  }, [issue?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Don't close underneath a nested dialog (confirm, log work…) — Escape/backdrop belongs to the top one.
  const onClose = useCallback(() => {
    if (document.querySelectorAll('[role="dialog"]').length > 1) return
    close()
  }, [close])

  if (!issue) return null
  return (
    <Modal open onClose={onClose} hideClose width={1180} className="h-[88vh]" bodyClassName="flex flex-col overflow-hidden p-0">
      <IssueView key={issue.id} issue={issue} variant="modal" onClose={close} />
    </Modal>
  )
}
