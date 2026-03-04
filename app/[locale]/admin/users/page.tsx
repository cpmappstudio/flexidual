import UsersPageLayout from "@/components/admin/users/users-page-layout";

export default function TenantUsersPage() {
    // This renders in the org context. 
    // The table will auto-detect "boston-public" and fetch only local users.
    return <UsersPageLayout />;
}