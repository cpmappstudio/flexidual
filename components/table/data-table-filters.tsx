"use client";

import * as React from "react";
import { Table } from "@tanstack/react-table";
import { ListFilter, X, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FilterConfig } from "@/lib/table/types";

interface DataTableFiltersProps<TData> {
    table: Table<TData>;
    filterConfigs: FilterConfig[];
    filtersMenuLabel?: string;
    clearFiltersLabel?: string;
}

export function DataTableFilters<TData>({
    table,
    filterConfigs,
    filtersMenuLabel,
    clearFiltersLabel,
}: DataTableFiltersProps<TData>) {
    const [openSubMenus, setOpenSubMenus] = React.useState<
        Record<string, boolean>
    >({});
    const [isMobile, setIsMobile] = React.useState(false);

    // Detect mobile viewport
    React.useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Check if any filters are active
    const hasActiveFilters = React.useMemo(() => {
        return filterConfigs.some((config) => {
            const column = table.getColumn(config.id);
            const filterValue = column?.getFilterValue() as string[] | undefined;
            return filterValue && filterValue.length > 0;
        });
    }, [table, filterConfigs, table.getState().columnFilters]);

    const clearAllFilters = () => {
        filterConfigs.forEach((config) => {
            const column = table.getColumn(config.id);
            column?.setFilterValue(undefined);
        });
    };

    const toggleFilterValue = (columnId: string, value: string) => {
        const column = table.getColumn(columnId);
        if (!column) return;

        const currentFilter = (column.getFilterValue() as string[]) ?? [];
        const isSelected = currentFilter.includes(value);

        const newFilter = isSelected
            ? currentFilter.filter((v) => v !== value)
            : [...currentFilter, value];

        column.setFilterValue(newFilter.length > 0 ? newFilter : undefined);
    };

    const isValueSelected = (columnId: string, value: string): boolean => {
        const column = table.getColumn(columnId);
        const filterValue = (column?.getFilterValue() as string[]) ?? [];
        return filterValue.includes(value);
    };

    const toggleSubMenu = (configId: string) => {
        setOpenSubMenus((prev) => ({
            ...prev,
            [configId]: !prev[configId],
        }));
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                        "cursor-pointer relative",
                        hasActiveFilters && "border-2 border-primary"
                    )}
                >
                    <ListFilter className="size-3.5" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuLabel>{filtersMenuLabel ?? "Filter by"}</DropdownMenuLabel>
                <DropdownMenuSeparator />

                {filterConfigs.map((config) => {
                    const column = table.getColumn(config.id);
                    if (!column) return null;

                    const filterValue = (column.getFilterValue() as string[]) ?? [];
                    const hasActiveFilters = filterValue.length > 0;
                    const isOpen = openSubMenus[config.id];

                    // Mobile: render as collapsible section
                    if (isMobile) {
                        return (
                            <div key={config.id} className="border-b last:border-b-0">
                                <Button
                                    variant="ghost"
                                    className="w-full justify-between px-2 py-1.5 h-auto font-normal hover:bg-accent"
                                    onClick={() => toggleSubMenu(config.id)}
                                >
                                    <span className="flex items-center gap-2">
                                        {config.label}
                                        {hasActiveFilters && (
                                            <Badge color="zinc" className="h-5 px-1.5">
                                                {filterValue.length}
                                            </Badge>
                                        )}
                                    </span>
                                    <ChevronRight
                                        className={cn(
                                            "h-4 w-4 transition-transform",
                                            isOpen && "rotate-90",
                                        )}
                                    />
                                </Button>
                                {isOpen && (
                                    <div className="pl-4 pb-2">
                                        {config.options.map((option) => (
                                            <DropdownMenuCheckboxItem
                                                key={option.value}
                                                checked={isValueSelected(config.id, option.value)}
                                                onCheckedChange={() =>
                                                    toggleFilterValue(config.id, option.value)
                                                }
                                            >
                                                {option.label}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    // Desktop: render as submenu
                    return (
                        <DropdownMenuSub key={config.id}>
                            <DropdownMenuSubTrigger className="flex items-center justify-between">
                                <span>{config.label}</span>
                                {hasActiveFilters && (
                                    <Badge color="zinc" className="ml-2 h-5 px-1.5">
                                        {filterValue.length}
                                    </Badge>
                                )}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-[200px]">
                                {config.options.map((option) => (
                                    <DropdownMenuCheckboxItem
                                        key={option.value}
                                        checked={isValueSelected(config.id, option.value)}
                                        onCheckedChange={() =>
                                            toggleFilterValue(config.id, option.value)
                                        }
                                    >
                                        {option.label}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    );
                })}

                {hasActiveFilters && (
                    <>
                        <DropdownMenuSeparator />
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-sm font-normal"
                            onClick={clearAllFilters}
                        >
                            <X className="mr-2 h-4 w-4" />
                            {clearFiltersLabel ?? "Clear all filters"}
                        </Button>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
