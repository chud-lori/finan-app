'use client';

import { useEffect, useState } from 'react';
import MoneyRecap from '@/components/MoneyRecap';
import { isMonthTurn } from '@/lib/monthTurn';

export default function MonthTurnRecap() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isMonthTurn(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, []);

  if (!show) return null;
  return (
    <div id="month-recap">
      <MoneyRecap />
    </div>
  );
}
