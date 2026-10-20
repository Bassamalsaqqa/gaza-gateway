<?php

declare(strict_types=1);

namespace App\Mvp\Reservations;

use DateTimeImmutable;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final class GuestAccessEmail
{
    public static function build(
        #[\SensitiveParameter]
        array $payload,
        #[\SensitiveParameter]
        array $config,
        string $attemptId,
        string $createdAt
    ): Email {
        $recipient = (string) $payload['recipient'];
        $type = (string) ($payload['type'] ?? 'email_verification');
        $code = (string) ($payload['code'] ?? '');
        $reference = isset($payload['reference']) ? (string) $payload['reference'] : '';

        $email = (new Email())
            ->from(new Address($config['senderEmail'], $config['senderName']))
            ->to($recipient)
            ->date(new DateTimeImmutable($createdAt));

        if (!empty($config['replyTo'])) {
            $email->replyTo($config['replyTo']);
        }

        $email->getHeaders()->addIdHeader('Message-ID', $attemptId . '@gazaairport.com');

        $escape = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $challengeId = isset($payload['challenge_id']) ? (string) $payload['challenge_id'] : '';
        $expiresAtStr = isset($payload['expires_at']) ? (string) $payload['expires_at'] : '';
        $createdAtDt = new DateTimeImmutable($createdAt);
        if ($expiresAtStr !== '') {
            try {
                $exp = new DateTimeImmutable($expiresAtStr);
            } catch (\Throwable) {
                $exp = $createdAtDt->modify('+12 hours');
            }
        } else {
            $exp = $createdAtDt->modify('+12 hours');
        }

        $remainingSeconds = max(0, $exp->getTimestamp() - $createdAtDt->getTimestamp());
        $remainingHours = (int) floor($remainingSeconds / 3600);
        $remainingMinutes = (int) floor($remainingSeconds / 60);
        $utcFormatted = $exp->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i \U\T\C');

        if ($remainingHours >= 1) {
            $expiryEn = "This code expires in {$remainingHours} hours (valid until {$utcFormatted}).";
            $expiryAr = "صالح لمدة {$remainingHours} ساعة (حتى {$utcFormatted}).";
        } elseif ($remainingMinutes >= 1) {
            $expiryEn = "This code expires in {$remainingMinutes} minutes (valid until {$utcFormatted}).";
            $expiryAr = "صالح لمدة {$remainingMinutes} دقيقة (حتى {$utcFormatted}).";
        } else {
            $expiryEn = "This code expires shortly (valid until {$utcFormatted}).";
            $expiryAr = "ينتهي هذا الرمز قريباً (حتى {$utcFormatted}).";
        }

        $appUrl = rtrim((string) (config('app.url') ?: 'https://gazaairport.com'), '/');
        $encodedRecipient = rawurlencode($recipient);

        if ($type === 'email_verification') {
            $subject = 'Gaza Gateway · Email Verification Code';
            $recoveryUrl = $challengeId !== '' ? "{$appUrl}/book#challenge={$challengeId}&email={$encodedRecipient}" : "{$appUrl}/book";

            $text = "Palestine Airways Limited / Gaza International Airport\n"
                . "Email Verification Code\n\n"
                . "Your verification code is: {$code}\n"
                . "{$expiryEn}\n"
                . "To continue your booking session:\n"
                . "{$recoveryUrl}\n\n"
                . "If you did not request this verification, please ignore this email.\n\n"
                . "الخطوط الجوية الفلسطينية / مطار غزة الدولي\n"
                . "رمز التحقق من البريد الإلكتروني\n\n"
                . "رمز التحقق الخاص بك هو: {$code}\n"
                . "{$expiryAr}\n"
                . "لمتابعة جلسة الحجز الخاصة بك:\n"
                . "{$recoveryUrl}\n\n"
                . "إذا لم تطلب رمز التحقق هذا، يُرجى تجاهل هذه الرسالة.\n";

            $html = '<section lang="en" dir="ltr" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">Gaza International Airport</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">Palestine Airways Limited · Guest Verification</p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">Use the verification code below to verify your email address:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace">' . $escape($code) . '</span>'
                . '</div>'
                . '<div style="margin:20px 0;text-align:center">'
                . '<a href="' . $escape($recoveryUrl) . '" style="display:inline-block;padding:12px 24px;background:#304936;color:#fffaf0;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">Continue Booking</a>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">' . $escape($expiryEn) . ' If you did not request this, please ignore this email.</p>'
                . '</article>'
                . '</section>'
                . '<section lang="ar" dir="rtl" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">مطار غزة الدولي</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">الخطوط الجوية الفلسطينية · تأكيد البريد</p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">استخدم رمز التحقق التالي لتأكيد بريدك الإلكتروني:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace" dir="ltr">' . $escape($code) . '</span>'
                . '</div>'
                . '<div style="margin:20px 0;text-align:center">'
                . '<a href="' . $escape($recoveryUrl) . '" style="display:inline-block;padding:12px 24px;background:#304936;color:#fffaf0;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">متابعة الحجز</a>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">' . $escape($expiryAr) . ' إذا لم تطلب هذا الرمز، يُرجى تجاهل هذه الرسالة.</p>'
                . '</article>'
                . '</section>';
        } else {
            $subject = 'Gaza Gateway · Access Code for ' . $reference;
            $encodedRef = rawurlencode($reference);
            $recoveryUrl = $challengeId !== '' ? "{$appUrl}/manage#ref={$encodedRef}&challenge={$challengeId}&email={$encodedRecipient}" : "{$appUrl}/manage";

            $text = "Palestine Airways Limited / Gaza International Airport\n"
                . "Reservation Access Code: {$reference}\n\n"
                . "Your access code is: {$code}\n"
                . "{$expiryEn}\n"
                . "To manage your reservation:\n"
                . "{$recoveryUrl}\n\n"
                . "If you did not request to manage this reservation, please ignore this email.\n\n"
                . "الخطوط الجوية الفلسطينية / مطار غزة الدولي\n"
                . "رمز الوصول لإدارة الحجز: {$reference}\n\n"
                . "رمز الوصول الخاص بك هو: {$code}\n"
                . "{$expiryAr}\n"
                . "لإدارة حجزك:\n"
                . "{$recoveryUrl}\n\n"
                . "إذا لم تطلب إدارة هذا الحجز، يُرجى تجاهل هذه الرسالة.\n";

            $html = '<section lang="en" dir="ltr" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">Gaza International Airport</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">Reservation Access · <strong dir="ltr">' . $escape($reference) . '</strong></p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">Use the code below to access and manage your reservation:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace">' . $escape($code) . '</span>'
                . '</div>'
                . '<div style="margin:20px 0;text-align:center">'
                . '<a href="' . $escape($recoveryUrl) . '" style="display:inline-block;padding:12px 24px;background:#304936;color:#fffaf0;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">Manage Reservation</a>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">' . $escape($expiryEn) . ' If you did not request access, please ignore this email.</p>'
                . '</article>'
                . '</section>'
                . '<section lang="ar" dir="rtl" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                . '<header style="padding:24px;background:#304936;color:#fffaf0">'
                . '<h1 style="margin:0;font-size:20px">مطار غزة الدولي</h1>'
                . '<p style="margin:4px 0 0;font-size:14px;color:#d7cebb">إدارة الحجز · <strong dir="ltr">' . $escape($reference) . '</strong></p>'
                . '</header>'
                . '<article style="padding:24px;color:#25352b">'
                . '<p style="font-size:16px">استخدم رمز الوصول التالي لإدارة وتأكيد حجزك:</p>'
                . '<div style="margin:20px 0;padding:16px;background:#eee7d8;border-radius:8px;text-align:center">'
                . '<span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#304936;font-family:monospace" dir="ltr">' . $escape($code) . '</span>'
                . '</div>'
                . '<div style="margin:20px 0;text-align:center">'
                . '<a href="' . $escape($recoveryUrl) . '" style="display:inline-block;padding:12px 24px;background:#304936;color:#fffaf0;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px">إدارة الحجز</a>'
                . '</div>'
                . '<p style="font-size:13px;color:#666">' . $escape($expiryAr) . ' إذا لم تطلب الوصول لهذا الحجز، يُرجى تجاهل هذه الرسالة.</p>'
                . '</article>'
                . '</section>';
        }

        $fullHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px;background:#eee7d8;color:#25352b;font-family:Arial,sans-serif">' . $html . '</body></html>';

        return $email->subject($subject)->text($text)->html($fullHtml);
    }
}
