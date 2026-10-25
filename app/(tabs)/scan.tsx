import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import AppButton from '@/components/AppButton';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { submitAttendance } from '@/lib/attendance';

export default function ScanScreen() {
  const { role } = useAuth();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // The camera fires the scan callback many times per second.
  // This lock makes sure ONE scan creates ONE database request.
  const lockRef = useRef(false);

  // ROLE GUARD: only students record attendance (the database
  // function checks the role again - this is just the friendly layer).
  if (role && role !== 'student') {
    return (
      <EmptyState
        icon="lock-closed-outline"
        title="Students only"
        message="Only student accounts can record attendance."
      />
    );
  }

  // EVENT: a QR code is detected by the camera (or a token is submitted).
  const submitPayload = async (raw: string) => {
    const text = raw.trim();
    if (!text || lockRef.current || processing) return;

    lockRef.current = true;
    setScanned(true); // stops further camera callbacks
    setProcessing(true);
    setMessage('Checking your QR code...');
    setSuccess(false);

    // Sends the payload to the database. We show success ONLY if
    // record_attendance() confirmed that the row was saved.
    const result = await submitAttendance(text);
    setSuccess(result.ok);
    setMessage(result.message);
    setProcessing(false);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    void submitPayload(data);
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) {
      setSuccess(false);
      setMessage('Enter the QR token first, then press Submit.');
      return;
    }
    void submitPayload(manualCode);
  };

  // EVENT: user presses "Scan Again" -> reset everything.
  const resetScanner = () => {
    lockRef.current = false;
    setScanned(false);
    setProcessing(false);
    setMessage(null);
    setSuccess(false);
    setManualCode('');
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      {permission.granted ? (
        <>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          />
          {!scanned && (
            <View style={styles.frameWrap} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.frameText}>Point the camera at the QR code</Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>
            The camera is used only to read event QR codes. You can also type
            the QR token manually below.
          </Text>
          <AppButton
            theme="primary"
            title="Grant Permission"
            icon="camera-outline"
            onPress={requestPermission}
          />
        </View>
      )}

      <View style={styles.overlay}>
        {message ? (
          <View style={styles.card}>
            <Text style={[styles.message, success ? styles.ok : styles.err]}>
              {processing ? message : message}
            </Text>
            {!processing && success && (
              <Text style={styles.successHint}>Your attendance history is up to date.</Text>
            )}
            <View style={styles.resultActions}>
              <AppButton
                theme="primary"
                title="Scan Again"
                icon="scan-outline"
                onPress={resetScanner}
                disabled={processing}
              />
              <AppButton title="Go to Home" icon="home-outline" onPress={() => router.push('/')} />
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.hint}>
              Scan the QR code shown by your teacher, or type the token manually.
            </Text>
            <TextInput
              style={styles.input}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="QR token (e.g. 3f9a...)"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!processing}
            />
            <AppButton
              theme="primary"
              title="Submit Token"
              icon="checkmark-outline"
              onPress={handleManualSubmit}
              disabled={processing}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  camera: {
    flex: 1,
  },
  frameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  frame: {
    width: 230,
    height: 230,
    borderWidth: 3,
    borderColor: COLORS.primary,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  frameText: {
    fontSize: 13,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  permissionText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  message: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  ok: {
    color: COLORS.success,
  },
  err: {
    color: COLORS.danger,
  },
  successHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  resultActions: {
    gap: 8,
  },
});
