import { useTranslations } from "next-intl"

export default function AdminPage() {
    const t = useTranslations()
    
    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-4">{t('admin.title')}</h1>
            <p>{t('admin.description')}</p>
        </div>
    );
}