
export interface DataPoint {
  date: string;
  value: number;
}

export class DemandService {
  /**
   * Generates mock historical data for the last 30 days
   */
  getHistoricalData(days: number = 30): DataPoint[] {
    const data: DataPoint[] = [];
    const today = new Date();
    
    for (let i = days; i > 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      
      // Random volume with some weekly seasonality (higher on weekends/Fridays)
      const dayOfWeek = d.getDay();
      let baseVolume = 150 + Math.random() * 50;
      if (dayOfWeek === 5 || dayOfWeek === 6) baseVolume += 40; // Peak on Fri/Sat
      
      data.push({
        date: d.toISOString().split('T')[0],
        value: Math.floor(baseVolume)
      });
    }
    return data;
  }

  /**
   * Calculates Linear Regression (y = mx + b)
   * Returns forecasts for next 'daysToForecast' days
   */
  predictNextDays(historical: DataPoint[], daysToForecast: number = 7) {
    const n = historical.length;
    if (n === 0) return { m: 0, b: 0, forecasts: [] };

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    historical.forEach((point, index) => {
      const x = index; // Time step
      const y = point.value;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const b = (sumY - m * sumX) / n;

    const forecasts: DataPoint[] = [];
    const lastDate = new Date(historical[historical.length - 1].date);

    for (let i = 1; i <= daysToForecast; i++) {
       const futureDate = new Date(lastDate);
       futureDate.setDate(futureDate.getDate() + i);
       
       const x = n + i - 1; // Continuous time step
       const y = m * x + b; // Linear projection

       // Add some noise/seasonality back for realism in "AI" demo
       const dayOfWeek = futureDate.getDay();
       let seasonality = 0;
       if (dayOfWeek === 5 || dayOfWeek === 6) seasonality = 30;

       forecasts.push({
         date: futureDate.toISOString().split('T')[0],
         value: Math.max(0, Math.floor(y + seasonality))
       });
    }

    return { m, b, forecasts };
  }
}
