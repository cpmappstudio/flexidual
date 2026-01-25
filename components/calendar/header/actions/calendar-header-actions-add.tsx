import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useCalendarContext } from '../../calendar-context'
import { useTranslations } from 'next-intl'

export default function CalendarHeaderActionsAdd() {
  const { setNewEventDialogOpen } = useCalendarContext()
  const t = useTranslations()
  return (
    <Button
      className="flex items-center gap-1 bg-deep-koamaru text-white hover:bg-deep-koamaru/90"
      onClick={() => setNewEventDialogOpen(true)}
    >
      <Plus />
      {t('calendar.addEvent')}
    </Button>
  )
}
