/**
 * The quick confirm before an early finish: one stray tap on Submit must not end a painting.
 * A real dialog (Escape, backdrop and focus trap come from the Modal primitive), with the two
 * plain answers the player needs: submit now, or keep painting.
 */
import { Modal } from '../ui'

export interface SubmitConfirmProps {
  open: boolean
  disabled?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function SubmitConfirm({ open, disabled = false, onCancel, onConfirm }: SubmitConfirmProps) {
  return (
    <Modal open={open} onClose={onCancel} aria-label="Submit your painting" hideClose className="daily-submit-modal">
      <div className="daily-submit-confirm">
        <h2 className="daily-submit-confirm__title">Submit now?</h2>
        <p className="daily-submit-confirm__body">Haiku will give the final verdict.</p>
        <div className="daily-submit-confirm__actions">
          <button
            type="button"
            data-testid="daily-submit-confirm"
            className="pp-btn daily-submit-confirm__answer daily-submit-confirm__yes"
            disabled={disabled}
            onClick={onConfirm}
          >
            Submit
          </button>
          <button
            type="button"
            data-testid="daily-submit-cancel"
            className="pp-btn daily-submit-confirm__answer daily-submit-confirm__keep"
            onClick={onCancel}
          >
            Keep painting
          </button>
        </div>
      </div>
    </Modal>
  )
}
