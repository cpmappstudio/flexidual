"use client";

import dynamic from "next/dynamic";

const FlexiClassroom = dynamic(() => import("./flexi-classroom"), { ssr: false });

export default FlexiClassroom;
