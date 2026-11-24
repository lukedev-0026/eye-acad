import { createFileRoute } from '@tanstack/react-router';

import { SignInPage } from '@/features/auth/components/sign-in-page';

// Rendered in the browser only: sign-in state lives in the browser, and
// nothing about the case is on this page.
export const Route = createFileRoute('/')({ ssr: false, component: SignInPage });
