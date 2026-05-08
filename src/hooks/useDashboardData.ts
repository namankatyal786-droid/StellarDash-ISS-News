import { useState, useEffect, useCallback } from 'react';
import { ISSPosition, Astronaut, NewsArticle } from '../lib/types';
import { calculateDistance, calculateSpeed } from '../lib/utils';
import { toast } from 'sonner';

export function useDashboardData() {
  const [issHistory, setIssHistory] = useState<ISSPosition[]>([]);
  const [astronauts, setAstronauts] = useState<Astronaut[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchISS = useCallback(async () => {
    try {
      const res = await fetch('/api/iss');
      const data = await res.json();
      const lat = parseFloat(data.iss_position.latitude);
      const lon = parseFloat(data.iss_position.longitude);

      // Reverse geocode
      let locationName = "Over Ocean";
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3`);
        const geoData = await geoRes.json();
        locationName = geoData.display_name || geoData.address?.country || geoData.address?.ocean || "Over Ocean";
      } catch (e) {
        console.warn("Geocoding failed", e);
      }

      const newPos: ISSPosition = {
        latitude: lat,
        longitude: lon,
        timestamp: data.timestamp,
        locationName,
      };

      setIssHistory(prev => {
        const history = [...prev];
        if (history.length > 0) {
          const last = history[history.length - 1];
          const dist = calculateDistance(last.latitude, last.longitude, newPos.latitude, newPos.longitude);
          const timeDiff = newPos.timestamp - last.timestamp;
          newPos.speed = calculateSpeed(dist, timeDiff);
        }
        
        const newHistory = [...history, newPos];
        // Keep last 30 for chart, last 15 for map trajectory (handled in component)
        return newHistory.slice(-30);
      });
    } catch (error) {
      console.error('ISS fetch failed:', error);
    }
  }, []);

  const fetchAstronauts = useCallback(async () => {
    try {
      const res = await fetch('/api/astros');
      const data = await res.json();
      setAstronauts(data.people || []);
    } catch (error) {
      console.error('Astros fetch failed:', error);
    }
  }, []);

  const fetchNews = useCallback(async (category = 'space', query = '') => {
    setIsLoadingNews(true);
    try {
      const res = await fetch(`/api/news?category=${category}&query=${query}`);
      const data = await res.json();
      if (data.articles) {
        const taggedArticles = data.articles.map((a: any) => ({ ...a, category }));
        setNews(taggedArticles);
        setLastFetch(Date.now());
      }
    } catch (error) {
      toast.error('Failed to fetch news');
    } finally {
      setIsLoadingNews(false);
    }
  }, []);

  useEffect(() => {
    fetchISS();
    fetchAstronauts();
    // Initial news fetch
    fetchNews();

    const issInterval = setInterval(fetchISS, 15000);
    return () => clearInterval(issInterval);
  }, [fetchISS, fetchAstronauts, fetchNews]);

  return {
    issHistory,
    currentPos: issHistory[issHistory.length - 1] || null,
    astronauts,
    news,
    isLoadingNews,
    fetchNews,
    lastFetch
  };
}
