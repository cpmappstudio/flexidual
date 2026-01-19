import { SignIn } from "@clerk/nextjs"
import { FlexidualLogo } from "@/components/ui/flexidual-logo"

export default function SignInPage() {
    return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10 bg-[radial-gradient(circle_at_top_right,_var(--color-fuzzy-wuzzy)_0%,_var(--color-deep-koamaru)_50%)]">
            <div className="flex w-full max-w-sm flex-col gap-6 animate-fade-in-up animate-delay-500 animate-duration-700">
                <SignIn
                    appearance={{
                        elements: {
                            logoImage: "size-20",
                        },
                        layout: {
                            logoImageUrl: "/flexidual-icon.png",
                        },
                    }}
                />
            </div>
        </div>
    )
}