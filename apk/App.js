import { useRef, useState } from 'react';
import { BackHandler, Linking, SafeAreaView, ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

// O app é só uma janela para o seu site: nenhum segredo, regra ou senha fica aqui dentro.
const URL = process.env.EXPO_PUBLIC_APP_URL;          // ex.: https://seu-site.com
const ORIGIN = URL ? new URL(URL).origin : '';

export default function App() {
  const web = useRef(null);
  const [canBack, setCanBack] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (canBack) { web.current?.goBack(); return true; } return false; });
    return () => sub.remove();
  }, [canBack]);

  if (!URL || !URL.startsWith('https://')) {
    return <SafeAreaView style={s.center}><Text style={s.t}>Defina EXPO_PUBLIC_APP_URL com o endereço https do seu site.</Text></SafeAreaView>;
  }
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      {failed ? (
        <View style={s.center}>
          <Text style={s.t}>Sem conexão com o servidor.</Text>
          <Pressable style={s.btn} onPress={() => { setFailed(false); web.current?.reload(); }}><Text style={s.bt}>Tentar de novo</Text></Pressable>
        </View>
      ) : (
        <WebView
          ref={web} source={{ uri: URL }} style={s.root}
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={(r) => {
            if (r.url.startsWith(ORIGIN)) return true;
            if (/^https:\/\/wa\.me\//.test(r.url)) { Linking.openURL(r.url); return false; }   // botão do WhatsApp abre o app do WhatsApp
            return false;                                                                        // nada fora do seu site
          }}
          onNavigationStateChange={(n) => setCanBack(n.canGoBack)}
          onError={() => setFailed(true)} onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setFailed(true)}
          startInLoadingState renderLoading={() => <View style={s.center}><ActivityIndicator color="#ffc53d" /></View>}
          javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled={false}
          allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
          setSupportMultipleWindows={false} cacheEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1026' },
  center: { flex: 1, backgroundColor: '#0b1026', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  t: { color: '#eef1fb', fontSize: 16, textAlign: 'center' },
  btn: { backgroundColor: '#ffc53d', paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14 }, bt: { fontWeight: '700', color: '#0b1026' },
});
