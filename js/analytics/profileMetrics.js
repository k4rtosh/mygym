// Domain helpers — profile metrics (no DOM)
(function () {
  function parseBirthDate(birthDate) {
    if (!birthDate) return null;
    const str = String(birthDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const d = new Date(str + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function ageFromBirthDate(birthDate, onDate = new Date()) {
    const birth = parseBirthDate(birthDate);
    if (!birth) return null;
    const on = onDate instanceof Date ? onDate : new Date(onDate);
    let age = on.getFullYear() - birth.getFullYear();
    const m = on.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && on.getDate() < birth.getDate())) age -= 1;
    if (age < 0 || age > 120) return null;
    return age;
  }

  function isProfileMetricsComplete(profile, latestWeight) {
    return !!(profile && profile.birth_date && latestWeight);
  }

  function profileMetricsGaps(profile, latestWeight) {
    const gaps = [];
    if (!profile?.birth_date) gaps.push('birth_date');
    if (!latestWeight) gaps.push('weight');
    return gaps;
  }

  window.AnalyticsProfile = {
    parseBirthDate,
    ageFromBirthDate,
    isProfileMetricsComplete,
    profileMetricsGaps
  };
})();
