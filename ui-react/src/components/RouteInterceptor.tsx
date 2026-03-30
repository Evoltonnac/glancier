import { useEffect, useState, useCallback, useRef } from "react";
import {
    useLocation,
    useNavigate,
    UNSAFE_NavigationContext,
} from "react-router-dom";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { useContext } from "react";
import { useI18n } from "../i18n";

interface RouteInterceptorProps {
    when: boolean;
    message?: string;
}

export function RouteInterceptor({ when, message }: RouteInterceptorProps) {
    const { t } = useI18n();
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingLocation, setPendingLocation] = useState<string | null>(null);
    const location = useLocation();
    const navigate = useNavigate();
    const navigationContext = useContext(UNSAFE_NavigationContext);
    const isBypassing = useRef(false);

    useEffect(() => {
        if (!when || !navigationContext) return;

        const { navigator } = navigationContext;
        const originalPush = navigator.push;
        const originalReplace = navigator.replace;

        navigator.push = (...args: Parameters<typeof originalPush>) => {
            if (isBypassing.current) {
                originalPush(...args);
                return;
            }

            const [to] = args;
            const nextPath = typeof to === "string" ? to : to.pathname;

            if (nextPath !== undefined && nextPath !== location.pathname) {
                setPendingLocation(nextPath);
                setShowConfirm(true);
            } else {
                originalPush(...args);
            }
        };

        navigator.replace = (...args: Parameters<typeof originalReplace>) => {
            if (isBypassing.current) {
                originalReplace(...args);
                return;
            }

            const [to] = args;
            const nextPath = typeof to === "string" ? to : to.pathname;

            if (nextPath !== undefined && nextPath !== location.pathname) {
                setPendingLocation(nextPath);
                setShowConfirm(true);
            } else {
                originalReplace(...args);
            }
        };

        return () => {
            navigator.push = originalPush;
            navigator.replace = originalReplace;
        };
    }, [when, location.pathname, navigationContext]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (when) {
                const displayMessage =
                    message ?? t("common.unsavedChanges.description");
                e.preventDefault();
                e.returnValue = displayMessage;
                return displayMessage;
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [when, message, t]);

    const handleStay = useCallback(() => {
        setShowConfirm(false);
        setPendingLocation(null);
    }, []);

    const handleLeave = useCallback(() => {
        setShowConfirm(false);
        if (pendingLocation) {
            isBypassing.current = true;
            navigate(pendingLocation);
            setPendingLocation(null);
        }
    }, [pendingLocation, navigate]);

    return (
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t("common.unsavedChanges.title")}
                    </DialogTitle>
                    <DialogDescription>
                        {message ?? t("common.unsavedChanges.description")}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={handleStay}>
                        {t("common.unsavedChanges.stay")}
                    </Button>
                    <Button variant="destructive" onClick={handleLeave}>
                        {t("common.unsavedChanges.leave")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
