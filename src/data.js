export const kpis = [
    { key: 'events', label: 'Tổng số sự kiện', value: '10,390,416', change: 'Trong khoảng chọn', tone: 'red', icon: '⬡', points: '0,34 10,30 18,32 28,20 40,26 51,19 61,25 71,14 81,18 100,5' },
    { key: 'alerts', label: 'Tổng số cảnh báo', value: '981', change: 'Trong khoảng chọn', tone: 'amber', icon: '⚠', points: '0,30 10,27 19,32 29,15 39,24 49,14 59,20 70,10 80,16 100,4' },
    { key: 'blockedAlerts', label: 'Cảnh báo đã chặn', value: '34', change: 'Trong khoảng chọn', tone: 'blue', icon: '◉', points: '0,31 10,26 20,29 30,16 40,23 50,15 60,19 70,11 80,18 100,2' },
    { key: 'protectedSystems', label: 'Hệ thống được bảo vệ', value: '947', change: 'Trong khoảng chọn', tone: 'teal', icon: '⬟', points: '0,33 10,31 20,21 30,26 40,17 50,20 60,11 70,18 80,8 100,1' },
    { key: 'activeSolutions', label: 'Giải pháp hoạt động', value: '6', change: 'Trong khoảng chọn', tone: 'violet', icon: '◎', points: '0,32 10,27 20,28 30,15 40,21 50,12 60,19 70,13 80,16 100,3' }
];
export const alertTypes = [['Cao', 34, 333, '#ff4059'], ['Trung bình', 42, 412, '#ffb547'], ['Thấp', 24, 236, '#278cff']];
export const sources = [['🇺🇸', '172.28.104.11', '1,203,448', '12.3%', '#f54762'], ['🇺🇸', '185.199.110.23', '892,331', '9.1%', '#ff883d'], ['🇸🇬', '45.252.45.67', '642,771', '6.6%', '#ffc63e'], ['🇺🇸', '103.21.244.9', '521,908', '5.3%', '#19c9d6'], ['🇻🇳', '192.168.1.10', '412,337', '4.2%', '#9eabc1'], ['🇷🇺', '203.0.113.5', '368,221', '3.8%', '#35a1ff'], ['🇨🇳', '77.88.22.33', '321,556', '3.3%', '#925dff'], ['🇨🇭', '14.102.56.78', '287,114', '2.9%', '#ab7cff'], ['🇬🇧', '91.210.45.12', '263,903', '2.7%', '#ff8842'], ['🇺🇸', '8.8.8.8', '241,087', '2.5%', '#ed4c66']];
export const solutions = [['Tường lửa (FS WAF)', 42.8, '4,220,112', '#1689ff'], ['Tường lửa (Palo Alto)', 30.1, '2,981,443', '#8755f5'], ['Tường lửa (Check Point)', 12.6, '1,243,550', '#15c9c1'], ['IPS/IDS', 7.4, '731,221', '#ff9146'], ['EDR', 4.2, '412,338', '#f54862'], ['Khác', 1.3, '125,671', '#7a92ad']];
export const attacks = [
    { from: [37.7749, -122.4194], to: [21.0285, 105.8542], src: '172.28.104.11', dst: 'VN-HN • 192.168.1.10', type: 'Brute Force', color: '#ff4565', time: '09:42:18' },
    { from: [51.5072, -0.1276], to: [10.8231, 106.6297], src: '45.252.45.67', dst: 'VN-HCM • 10.20.4.18', type: 'Web Attack', color: '#f8b640', time: '09:41:52' },
    { from: [35.6762, 139.6503], to: [16.0544, 108.2022], src: '103.21.244.9', dst: 'VN-ĐN • 172.16.0.21', type: 'Malware', color: '#29c8eb', time: '09:40:31' },
    { from: [55.7558, 37.6173], to: [20.8449, 106.6881], src: '203.0.113.5', dst: 'VN-HP • 192.168.10.8', type: 'Recon', color: '#a178ff', time: '09:39:04' },
    { from: [40.7128, -74.006], to: [18.6796, 105.6813], src: '185.199.110.23', dst: 'VN-NA • 10.4.1.7', type: 'DDoS', color: '#ff7858', time: '09:37:22' },
    { from: [1.3521, 103.8198], to: [12.2388, 109.1967], src: '77.88.22.33', dst: 'VN-KH • 172.16.8.9', type: 'Policy', color: '#29c8eb', time: '09:35:49' }
];
export const provinces = ['An Giang', 'Bắc Ninh', 'Cà Mau', 'Cao Bằng', 'Đắk Lắk', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Tĩnh', 'Hưng Yên', 'Khánh Hòa', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Nghệ An', 'Ninh Bình', 'Phú Thọ', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sơn La', 'Tây Ninh', 'Thái Nguyên', 'Thanh Hóa', 'Thành phố Cần Thơ', 'Thành phố Đà Nẵng', 'Thành phố Hà Nội', 'Thành phố Hải Phòng', 'Thành phố Hồ Chí Minh', 'Thành phố Huế', 'Tuyên Quang', 'Vĩnh Long'];
