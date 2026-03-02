import { useState, useEffect } from 'react'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import './App.css'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

function USMap({ coords }) {
  return (
    <div className="us-map">
      <ComposableMap projection="geoAlbersUsa" style={{ width: '100%', height: 'auto' }}>
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map(geo => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                style={{
                  default: { fill: 'var(--map-land)', stroke: 'var(--map-border)', strokeWidth: 0.5, outline: 'none' },
                  hover:   { fill: 'var(--map-land)', stroke: 'var(--map-border)', strokeWidth: 0.5, outline: 'none' },
                  pressed: { fill: 'var(--map-land)', stroke: 'var(--map-border)', strokeWidth: 0.5, outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>
        <Marker coordinates={[coords.longitude, coords.latitude]}>
          <circle r={6} fill="#c4122f" stroke="white" strokeWidth={1.5} />
        </Marker>
      </ComposableMap>
    </div>
  )
}

const ROCKIES_TEAM_ID = 115
const CURRENT_SEASON = new Date().getFullYear()

const WMO_CODES = {
  0:  { label: 'Clear',                icon: '☀️' },
  1:  { label: 'Mainly Clear',         icon: '🌤️' },
  2:  { label: 'Partly Cloudy',        icon: '⛅' },
  3:  { label: 'Overcast',             icon: '☁️' },
  45: { label: 'Fog',                  icon: '🌫️' },
  48: { label: 'Icy Fog',              icon: '🌫️' },
  51: { label: 'Light Drizzle',        icon: '🌦️' },
  53: { label: 'Drizzle',              icon: '🌦️' },
  55: { label: 'Heavy Drizzle',        icon: '🌧️' },
  61: { label: 'Light Rain',           icon: '🌧️' },
  63: { label: 'Rain',                 icon: '🌧️' },
  65: { label: 'Heavy Rain',           icon: '🌧️' },
  71: { label: 'Light Snow',           icon: '🌨️' },
  73: { label: 'Snow',                 icon: '❄️' },
  75: { label: 'Heavy Snow',           icon: '❄️' },
  77: { label: 'Snow Grains',          icon: '🌨️' },
  80: { label: 'Rain Showers',         icon: '🌦️' },
  81: { label: 'Rain Showers',         icon: '🌧️' },
  82: { label: 'Heavy Showers',        icon: '⛈️' },
  85: { label: 'Snow Showers',         icon: '🌨️' },
  86: { label: 'Heavy Snow Showers',   icon: '❄️' },
  95: { label: 'Thunderstorm',         icon: '⛈️' },
  96: { label: 'Thunderstorm w/ Hail', icon: '⛈️' },
  99: { label: 'Thunderstorm w/ Hail', icon: '⛈️' },
}

async function fetchRockiesGame(date) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?teamId=${ROCKIES_TEAM_ID}&startDate=${date}&endDate=${date}&sportId=1&hydrate=decisions`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch schedule')
  return res.json()
}

async function fetchStandings() {
  const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=${CURRENT_SEASON}&standingsTypes=regularSeason`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch standings')
  return res.json()
}

async function fetchVenueInfo(venueId) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/venues/${venueId}?hydrate=location`)
  const data = await res.json()
  const loc = data.venues?.[0]?.location
  return {
    city:        loc?.city ?? null,
    state:       loc?.stateAbbrev ?? null,
    coords:      loc?.defaultCoordinates ?? null,
  }
}

async function fetchWeather(coords, gameDate) {
  const { latitude, longitude } = coords
  const date = gameDate.split('T')[0]

  const gameDay = new Date(date + 'T00:00:00Z')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const diffDays = (gameDay - today) / (1000 * 60 * 60 * 24)

  if (diffDays > 16) return { unavailable: true }

  const isPast = diffDays < 0
  const baseUrl = isPast
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast'

  const res = await fetch(
    `${baseUrl}?latitude=${latitude}&longitude=${longitude}` +
    `&hourly=temperature_2m,weathercode,precipitation_probability,windspeed_10m` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=UTC` +
    `&start_date=${date}&end_date=${date}`
  )
  const data = await res.json()
  if (!data.hourly) return null

  const idx = new Date(gameDate).getUTCHours()
  return {
    temp:       Math.round(data.hourly.temperature_2m[idx]),
    code:       data.hourly.weathercode[idx],
    precipProb: data.hourly.precipitation_probability[idx],
    windspeed:  Math.round(data.hourly.windspeed_10m[idx]),
  }
}

export default function App() {
  const [date, setDate] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dark, setDark] = useState(true)
  const [standings, setStandings] = useState(null)
  const [standingsError, setStandingsError] = useState(null)
  const [weather, setWeather] = useState(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  useEffect(() => {
    document.body.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    fetchStandings()
      .then(data => {
        const division = data.records?.find(r =>
          r.teamRecords.some(t => t.team.id === ROCKIES_TEAM_ID)
        )
        setStandings(division?.teamRecords ?? [])
      })
      .catch(() => setStandingsError('Could not load standings.'))
  }, [])

  // Auto-refresh every 30s when a game is live
  useEffect(() => {
    if (!result?.isLive) return
    const id = setInterval(() => handleCheck(date), 30000)
    return () => clearInterval(id)
  }, [result?.isLive, date])

  function changeDate(delta) {
    if (!date) return
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    const newDate = d.toISOString().split('T')[0]
    setDate(newDate)
    handleCheck(newDate)
  }

  async function handleCheck(checkDate = date) {
    if (!checkDate) return
    setLoading(true)
    setResult(null)
    setError(null)
    setWeather(null)
    try {
      const data = await fetchRockiesGame(checkDate)
      const games = data.dates?.[0]?.games ?? []
      if (games.length === 0) {
        setResult({ plays: false })
      } else {
        const game = games[0]
        const isHome = game.teams.home.team.id === ROCKIES_TEAM_ID
        const opponent = isHome ? game.teams.away.team.name : game.teams.home.team.name
        const venueId = game.venue?.id
        const time = game.gameDate
          ? new Date(game.gameDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver', timeZoneName: 'short' })
          : null
        const status = game.status?.detailedState
        const abstractState = game.status?.abstractGameState
        const isFinal = abstractState === 'Final'
        const isLive = abstractState === 'Live'
        const rockiesScore = isHome ? game.teams.home.score : game.teams.away.score
        const opponentScore = isHome ? game.teams.away.score : game.teams.home.score
        const rockiesWon = isFinal && rockiesScore != null && rockiesScore > opponentScore
        const winningPitcher = game.decisions?.winner?.fullName ?? null
        const losingPitcher = game.decisions?.loser?.fullName ?? null
        const savePitcher = game.decisions?.save?.fullName ?? null
        const linescore = game.linescore ?? null
        const inningState = linescore?.inningState  // "Top", "Middle", "Bottom", "End"
        const inningOrdinal = linescore?.currentInningOrdinal
        const outs = linescore?.outs ?? null

        // Fetch venue info (location + coords) once, use for both display and weather
        let venue = game.venue?.name, city = null, state = null, coords = null
        if (venueId) {
          try {
            const info = await fetchVenueInfo(venueId)
            city = info.city
            state = info.state
            coords = info.coords
          } catch (_) {}
        }

        setResult({ plays: true, opponent, isHome, venue, city, state, coords, time, status, gameCount: games.length, isFinal, isLive, rockiesScore, opponentScore, rockiesWon, winningPitcher, losingPitcher, savePitcher, inningState, inningOrdinal, outs })

        if (coords && game.gameDate) {
          setWeatherLoading(true)
          fetchWeather(coords, game.gameDate)
            .then(w => setWeather(w))
            .catch(() => setWeather(null))
            .finally(() => setWeatherLoading(false))
        }
      }
    } catch (e) {
      setError('Could not fetch schedule. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const weatherInfo = weather ? (WMO_CODES[weather.code] ?? { label: 'Unknown', icon: '🌡️' }) : null

  return (
    <div className="container">
      <div className="card">
        <button className="theme-toggle" onClick={() => setDark(d => !d)} title="Toggle theme">
          {dark ? '☀️' : '🌙'}
        </button>

        <div className="team-logo">CR</div>
        <h1>Rockie's Game Checker</h1>
        <p className="subtitle">Do the Colorado Rockies play on this date?</p>

        <div className="input-row">
          <button className="arrow-btn" onClick={() => changeDate(-1)} disabled={!date || loading} title="Previous day">&#8592;</button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCheck()}
          />
          <button className="arrow-btn" onClick={() => changeDate(1)} disabled={!date || loading} title="Next day">&#8594;</button>
          <button onClick={() => handleCheck()} disabled={!date || loading}>
            {loading ? '...' : 'Check'}
          </button>
        </div>
        <button className="today-btn" onClick={() => { const t = new Date().toLocaleDateString('en-CA'); setDate(t); handleCheck(t) }} disabled={loading}>
          Today
        </button>

        {error && <p className="error">{error}</p>}

        {result && (
          <div className={`result ${result.plays ? 'yes' : 'no'}`}>
            {result.plays ? (
              <>
                <div className="result-icon">⚾</div>
                <h2>{result.isFinal ? (result.rockiesWon ? 'Rockies Won!' : 'Rockies Lost') : result.isLive ? 'Game In Progress' : 'Yes, they play!'}</h2>
                {result.gameCount > 1 && <p className="tag">Doubleheader ({result.gameCount} games)</p>}
                <div className={`venue-badge ${result.isHome ? 'home' : 'away'}`}>
                  {result.isHome ? '🏠 Home Game' : '✈️ Away Game'}
                </div>

                {(result.isFinal || result.isLive) ? (
                  <div className="scoreboard">
                    {result.isLive && (
                      <div className="live-badge">
                        <span className="live-dot" />
                        LIVE &mdash; {result.inningState} {result.inningOrdinal}
                        {result.outs != null && ` · ${result.outs} out${result.outs !== 1 ? 's' : ''}`}
                      </div>
                    )}
                    <div className="score-row">
                      <span className="score-team">Colorado Rockies</span>
                      <span className={`score-num ${result.isFinal ? (result.rockiesWon ? 'score-win' : 'score-loss') : ''}`}>{result.rockiesScore ?? '-'}</span>
                    </div>
                    <div className="score-row">
                      <span className="score-team">{result.opponent}</span>
                      <span className={`score-num ${result.isFinal ? (!result.rockiesWon ? 'score-win' : 'score-loss') : ''}`}>{result.opponentScore ?? '-'}</span>
                    </div>
                    {result.isFinal && <p className="score-final">{result.status}</p>}
                    {(result.winningPitcher || result.losingPitcher) && (
                      <div className="pitchers">
                        {result.winningPitcher && <p><span className="pitcher-label">W</span> {result.winningPitcher}</p>}
                        {result.losingPitcher  && <p><span className="pitcher-label loss">L</span> {result.losingPitcher}</p>}
                        {result.savePitcher    && <p><span className="pitcher-label save">S</span> {result.savePitcher}</p>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="opponent"><strong>{result.isHome ? 'vs' : '@'} {result.opponent}</strong></p>
                )}

                {result.venue && <p>{result.venue}</p>}
                {result.city && result.state && (
                  <p className="location">📍 {result.city}, {result.state}</p>
                )}
                {result.coords && <USMap coords={result.coords} />}
                {!result.isFinal && !result.isLive && result.time && <p>{result.time}</p>}
                {!result.isFinal && !result.isLive && result.status && result.status !== 'Scheduled' && (
                  <p className="status-tag">{result.status}</p>
                )}

                {weatherLoading && (
                  <div className="weather-section">
                    <div className="weather-divider" />
                    <p className="loading-text">Loading weather...</p>
                  </div>
                )}
                {!weatherLoading && weather && (
                  <div className="weather-section">
                    <div className="weather-divider" />
                    {weather.unavailable ? (
                      <p className="weather-unavailable">⛅ Weather forecast not available yet — check back closer to game day</p>
                    ) : weatherInfo && (
                      <>
                        <p className="weather-label">Game Time Weather</p>
                        <div className="weather-main">
                          <span className="weather-icon">{weatherInfo.icon}</span>
                          <span className="weather-temp">{weather.temp}°F</span>
                        </div>
                        <p className="weather-condition">{weatherInfo.label}</p>
                        <div className="weather-details">
                          <span>💧 {weather.precipProb}% precip</span>
                          <span>💨 {weather.windspeed} mph</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="result-icon">😴</div>
                <h2>No game today</h2>
                <p>The Rockies are off on this date.</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card standings-card">
        <h2 className="standings-title">NL West Standings <span className="standings-season">{CURRENT_SEASON}</span></h2>
        {standingsError && <p className="error">{standingsError}</p>}
        {!standings && !standingsError && <p className="loading-text">Loading standings...</p>}
        {standings && (
          <table className="standings-table">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-team">Team</th>
                <th>W</th>
                <th>L</th>
                <th>PCT</th>
                <th>GB</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((team, i) => {
                const isRockies = team.team.id === ROCKIES_TEAM_ID
                return (
                  <tr key={team.team.id} className={isRockies ? 'rockies-row' : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-team">
                      {isRockies ? <strong>{team.team.name}</strong> : team.team.name}
                    </td>
                    <td>{team.wins}</td>
                    <td>{team.losses}</td>
                    <td>{team.winningPercentage}</td>
                    <td>{i === 0 ? '—' : team.gamesBack}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
